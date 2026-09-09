// server-manychat.js
// Endpoint que ManyChat llama mediante "External Request" (Dynamic Content).
// Toda la lógica de conversación vive en flow.json — este archivo solo la interpreta
// y devuelve el JSON en el formato que ManyChat espera, sin usar el constructor visual.
//
// A diferencia de server.js (que hablaba directo con la Graph API de Facebook),
// aquí ManyChat es quien entrega los mensajes — nosotros solo respondemos "qué decir después".

const express = require("express");
const fs = require("fs");
const path = require("path");
const calculadora = require("./ruta-calculadora");
const app = express();
app.use(express.json());
app.use("/calculadora", calculadora);
const PORT = process.env.PORT || 3000;
// URL pública de ESTE servidor una vez desplegado, ej: https://tu-app.onrender.com/manychat-brain
const BRAIN_URL = process.env.BRAIN_URL || `http://localhost:${PORT}/manychat-brain`;

const flow = JSON.parse(fs.readFileSync(path.join(__dirname, "flow.json"), "utf8"));

// Estado en memoria por usuario. Para producción real, cambia esto por una base de datos.
const userState = new Map();
function getState(userId) {
  if (!userState.has(userId)) {
    userState.set(userId, { node: null, data: {}, awaitingCapture: null });
  }
  return userState.get(userId);
}

function renderText(text, data) {
  return text.replace(/{{(.*?)}}/g, (_, key) => data[key.trim()] || "");
}

function matchKeyword(text) {
  const lower = (text || "").toLowerCase();
  for (const rule of flow.keywords || []) {
    if (rule.match.some((kw) => lower.includes(kw.toLowerCase()))) {
      return rule.next;
    }
  }
  return null;
}

// Convierte las quick_replies de un nodo de flow.json al formato que espera ManyChat.
// Cada botón vuelve a llamar a ESTE MISMO endpoint (External Callback / "dynamic_block_callback"),
// pasando de vuelta el user_id y el payload elegido.
function buildQuickReplies(nodeQuickReplies, userId) {
  if (!nodeQuickReplies || !nodeQuickReplies.length) return [];
  return nodeQuickReplies.map((qr) => ({
    type: "dynamic_block_callback",
    caption: qr.title,
    url: BRAIN_URL,
    method: "post",
    payload: { user_id: userId, payload: qr.payload },
  }));
}

// Recorre la cadena de nodos (siguiendo auto_next) y arma el arreglo de mensajes
// + las quick_replies finales, todo en una sola respuesta.
function buildResponse(userId, startNodeId) {
  const state = getState(userId);
  const messages = [];
  let nodeId = startNodeId;
  let finalQuickReplies = [];
  let actions = [];

  // Límite de seguridad para no crear un loop infinito si el flow.json tiene un error
  for (let hops = 0; hops < 10; hops++) {
    const node = flow.nodes[nodeId];
    if (!node) break;

    state.node = nodeId;
    messages.push({ type: "text", text: renderText(node.text, state.data) });

    if (node.notify) {
      actions.push({ action: "add_tag", tag_name: "lead_calificado" });
      console.log("🔔 LEAD LISTO PARA ASESOR:", userId, state.data);
    }

    state.awaitingCapture = node.capture_field
      ? { field: node.capture_field, next: node.next }
      : null;

    if (node.auto_next) {
      nodeId = node.auto_next;
      continue; // seguimos encadenando mensajes en la misma respuesta
    }

    finalQuickReplies = buildQuickReplies(node.quick_replies, userId);
    break;
  }

  return {
    version: "v2",
    content: {
      messages,
      actions,
      quick_replies: finalQuickReplies,
    },
  };
}

// ---- Endpoint principal que llama el bloque "External Request" de ManyChat ----
app.post("/manychat-brain", (req, res) => {
  // Ajusta estos nombres de campo según cómo configures el cuerpo de la petición
  // en ManyChat (ahí eliges qué "merge tags" mandar).
  const userId = req.body.user_id || req.body.id || "desconocido";
  const incomingPayload = req.body.payload; // viene del botón tocado, si lo hay
  const incomingText = req.body.text || req.body.last_input_text; // si el usuario escribió texto libre

  const state = getState(userId);
  let targetNode;

  if (incomingPayload) {
    // El usuario tocó un botón. El payload puede ser "NODO" o "NODO::campo::valor"
    const parts = String(incomingPayload).split("::");
    targetNode = parts[0];
    if (parts.length === 3) {
      const [, field, value] = parts;
      state.data[field] = decodeURIComponent(value);
    }
  } else if (state.awaitingCapture) {
    // Estábamos esperando que el usuario escribiera algo (nombre, ciudad, semanas, etc.)
    const { field, next } = state.awaitingCapture;
    state.data[field] = (incomingText || "").trim();
    state.awaitingCapture = null;
    targetNode = next;
  } else if (!state.node) {
    // Primera vez que este usuario escribe, sin importar qué haya puesto
    // (podría ser "hola", "buenas", "quiero información", etc.)
    targetNode = flow.start;
  } else if (incomingText) {
    // Texto libre sin estar esperando captura: revisamos palabras clave
    targetNode = matchKeyword(incomingText) || null;
    if (!targetNode) {
      // No entendimos: repetimos el nodo actual con un mensaje de aclaración
      const current = state.node ? flow.nodes[state.node] : null;
      return res.json({
        version: "v2",
        content: {
          messages: [
            { type: "text", text: flow.nodes.fallback.text },
            ...(current ? [{ type: "text", text: renderText(current.text, state.data) }] : []),
          ],
          actions: [],
          quick_replies: current ? buildQuickReplies(current.quick_replies, userId) : buildQuickReplies(flow.nodes[flow.start].quick_replies, userId),
        },
      });
    }
  } else {
    // Primera interacción, sin payload ni texto
    targetNode = flow.start;
  }

  const response = buildResponse(userId, targetNode || flow.start);
  res.json(response);
});

app.get("/", (_req, res) => {
  res.send("Cerebro de Asesores Previsionales MX (formato ManyChat) corriendo correctamente.");
});

app.listen(PORT, () => {
  console.log(`Servidor (modo ManyChat) escuchando en el puerto ${PORT}`);
  console.log(`Configura el External Request de ManyChat apuntando a: ${BRAIN_URL}`);
});
