// server.js
// Webhook de Messenger para Asesores Previsionales MX.
// Toda la conversación se define en flow.json — este archivo solo interpreta ese guion.

const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const NOTIFY_WEBHOOK_URL = process.env.NOTIFY_WEBHOOK_URL || null; // opcional: Slack/Discord/etc.

if (!VERIFY_TOKEN || !PAGE_ACCESS_TOKEN) {
  console.warn(
    "⚠️  Falta VERIFY_TOKEN o PAGE_ACCESS_TOKEN en las variables de entorno. " +
    "El servidor va a arrancar, pero no podrá verificar el webhook ni enviar mensajes hasta que los configures."
  );
}

// ---- Cargar el guion (flow.json) ----
const flow = JSON.parse(fs.readFileSync(path.join(__dirname, "flow.json"), "utf8"));

// ---- Estado de cada usuario en memoria ----
// OJO: esto se borra si el servidor se reinicia. Para producción real conviene
// cambiar este Map por una base de datos pequeña (ej. SQLite, Redis, o un JSON en disco).
const userState = new Map();

function getState(senderId) {
  if (!userState.has(senderId)) {
    userState.set(senderId, { node: null, data: {}, awaitingCapture: null });
  }
  return userState.get(senderId);
}

// ---- Enviar mensajes a Messenger (Graph API) ----
async function sendToMessenger(senderId, text, quickReplies) {
  const body = {
    recipient: { id: senderId },
    message: {
      text,
      ...(quickReplies && quickReplies.length
        ? {
            quick_replies: quickReplies.map((qr) => ({
              content_type: "text",
              title: qr.title,
              payload: qr.payload,
            })),
          }
        : {}),
    },
  };

  const res = await fetch(
    `https://graph.facebook.com/v20.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    console.error("Error enviando mensaje a Messenger:", res.status, errText);
  }
}

// ---- Notificar a un humano cuando hay un lead calificado o una queja ----
async function notifyHuman(senderId, data) {
  console.log("🔔 LEAD LISTO PARA ASESOR:", senderId, data);

  if (NOTIFY_WEBHOOK_URL) {
    try {
      await fetch(NOTIFY_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `🔔 Nuevo lead de Asesores Previsionales MX\nID: ${senderId}\nDatos: ${JSON.stringify(
            data,
            null,
            2
          )}`,
        }),
      });
    } catch (err) {
      console.error("No se pudo enviar la notificación externa:", err.message);
    }
  }
}

// ---- Reemplazar variables {{campo}} dentro del texto de un nodo ----
function renderText(text, data) {
  return text.replace(/{{(.*?)}}/g, (_, key) => data[key.trim()] || "");
}

// ---- Enviar un nodo del flujo y encadenar auto_next si aplica ----
async function renderNode(senderId, nodeId) {
  const node = flow.nodes[nodeId];
  if (!node) {
    console.error("Nodo no encontrado en flow.json:", nodeId);
    return;
  }

  const state = getState(senderId);
  state.node = nodeId;

  // Si este nodo espera un texto libre después (capture_field + next), lo recordamos
  state.awaitingCapture = node.capture_field
    ? { field: node.capture_field, next: node.next }
    : null;

  await sendToMessenger(
    senderId,
    renderText(node.text, state.data),
    node.quick_replies
  );

  if (node.notify) {
    await notifyHuman(senderId, state.data);
  }

  if (node.auto_next) {
    // Pequeña pausa para que no se sientan los mensajes pegados uno tras otro
    await new Promise((r) => setTimeout(r, 900));
    await renderNode(senderId, node.auto_next);
  }
}

// ---- Buscar coincidencia de palabra clave en un texto libre ----
function matchKeyword(text) {
  const lower = text.toLowerCase();
  for (const rule of flow.keywords || []) {
    if (rule.match.some((kw) => lower.includes(kw.toLowerCase()))) {
      return rule.next;
    }
  }
  return null;
}

// ---- Procesar un payload de quick reply, incluyendo el formato NODO::campo::valor ----
async function handlePayload(senderId, payload) {
  const state = getState(senderId);
  const parts = payload.split("::");
  const nextNode = parts[0];

  if (parts.length === 3) {
    const [, field, value] = parts;
    state.data[field] = decodeURIComponent(value);
  }

  await renderNode(senderId, nextNode);
}

// ---- Procesar un mensaje de texto libre ----
async function handleFreeText(senderId, text) {
  const state = getState(senderId);

  // Caso 1: el nodo actual está esperando que capturemos este texto en un campo
  if (state.awaitingCapture) {
    const { field, next } = state.awaitingCapture;
    state.data[field] = text.trim();
    state.awaitingCapture = null;
    await renderNode(senderId, next);
    return;
  }

  // Caso 2: buscamos si el texto coincide con alguna palabra clave global
  const kwNode = matchKeyword(text);
  if (kwNode) {
    await renderNode(senderId, kwNode);
    return;
  }

  // Caso 3: no entendimos — mensaje de fallback y repetimos el nodo actual
  await sendToMessenger(senderId, flow.nodes.fallback.text);
  if (state.node) {
    const current = flow.nodes[state.node];
    await sendToMessenger(senderId, renderText(current.text, state.data), current.quick_replies);
  } else {
    await renderNode(senderId, flow.start);
  }
}

// =======================================================
// Rutas del webhook
// =======================================================

// Verificación inicial que pide Meta al configurar el webhook
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("✅ Webhook verificado correctamente.");
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// Eventos entrantes de Messenger
app.post("/webhook", async (req, res) => {
  const body = req.body;

  if (body.object !== "page") {
    return res.sendStatus(404);
  }

  // Respondemos de inmediato a Meta; procesamos después.
  res.status(200).send("EVENT_RECEIVED");

  for (const entry of body.entry || []) {
    for (const event of entry.messaging || []) {
      const senderId = event.sender && event.sender.id;
      if (!senderId) continue;

      try {
        if (event.message && event.message.quick_reply) {
          await handlePayload(senderId, event.message.quick_reply.payload);
        } else if (event.message && event.message.text) {
          const state = getState(senderId);
          if (!state.node) {
            // Primera interacción de este usuario
            await renderNode(senderId, flow.start);
          } else {
            await handleFreeText(senderId, event.message.text);
          }
        } else if (event.postback) {
          await handlePayload(senderId, event.postback.payload);
        }
      } catch (err) {
        console.error("Error procesando evento de Messenger:", err);
      }
    }
  }
});

// Endpoint simple para confirmar que el servidor está vivo
app.get("/", (_req, res) => {
  res.send("Bot de Asesores Previsionales MX corriendo correctamente.");
});

app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});
