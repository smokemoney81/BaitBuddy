// Prompt-Format des lokalen Modells (Qwen3.5, ChatML) und Tool-Call-Parser.
//
// Bildet das offizielle Chat-Template von Qwen3.5 (chat_template.jinja des
// Modells) nach, statt es nativ auszuwerten: So bleibt die Engine in der APK
// schmal, und Prompt-/Tool-Änderungen erreichen die Nutzer mit dem nächsten
// Web-Deploy — ohne App-Update.
//
// Denkmodus ist aus (`enable_thinking=false` im Template = leerer
// <think>-Block vor der Antwort): Auf dem Handy kostet jedes Token Zeit, und
// für Buddy-Antworten bringt die Denkphase keinen spürbaren Gewinn.

const IM_START = '<|im_start|>';
const IM_END = '<|im_end|>';
const EMPTY_THINK = '<think>\n\n</think>\n\n';

// Wörtlich aus dem Qwen3.5-Template — das Modell wurde auf genau diesen Text trainiert.
const TOOL_INSTRUCTIONS = '\n\nIf you choose to call a function ONLY reply in the following format with NO suffix:\n\n<tool_call>\n<function=example_function_name>\n<parameter=example_parameter_1>\nvalue_1\n</parameter>\n<parameter=example_parameter_2>\nThis is the value for the second parameter\nthat can span\nmultiple lines\n</parameter>\n</function>\n</tool_call>\n\n<IMPORTANT>\nReminder:\n- Function calls MUST follow the specified format: an inner <function=...></function> block must be nested within <tool_call></tool_call> XML tags\n- Required parameters MUST be specified\n- You may provide optional reasoning for your function call in natural language BEFORE the function call, but NOT after\n- If there is no function call available, answer the question like normal with your current knowledge and do not tell the user about function calls\n</IMPORTANT>';

/** Stop-Text: Nach einem Tool-Call muss die App erst das Ergebnis liefern. */
export const TOOL_CALL_STOP = '</tool_call>';

/**
 * JSON wie Pythons json.dumps(ensure_ascii=False) — das `tojson` des
 * Templates trennt mit ", " und ": ". Gleiche Schreibweise wie im Training.
 */
export function pyJson(value) {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return `[${value.map(pyJson).join(', ')}]`;
  if (typeof value === 'object') {
    return `{${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${JSON.stringify(k)}: ${pyJson(v)}`)
      .join(', ')}}`;
  }
  return JSON.stringify(value);
}

/**
 * Stabiler Prompt-Anfang: System-Nachricht inkl. Tool-Beschreibungen. Bleibt
 * über ein Gespräch gleich — die Engine sichert ihren Zustand am Ende dieses
 * Abschnitts und rechnet ihn bei Folgefragen nicht neu.
 *
 * @param {string} systemText
 * @param {Array<{type:'function', function:{name:string, description:string, parameters:object}}>} tools
 */
export function buildSystemPrefix(systemText, tools = []) {
  let out = `${IM_START}system\n`;
  if (tools.length) {
    out += '# Tools\n\nYou have access to the following functions:\n\n<tools>';
    for (const tool of tools) out += `\n${pyJson(tool)}`;
    out += '\n</tools>';
    out += TOOL_INSTRUCTIONS;
    const text = systemText.trim();
    if (text) out += `\n\n${text}`;
  } else {
    out += systemText.trim();
  }
  return `${out}${IM_END}\n`;
}

function renderParamValue(value) {
  if (value !== null && typeof value === 'object') return pyJson(value);
  return String(value);
}

/** Ein Tool-Call in der Schreibweise des Templates. */
export function renderToolCall(call) {
  let out = `<tool_call>\n<function=${call.name}>\n`;
  for (const [key, value] of Object.entries(call.arguments || {})) {
    out += `<parameter=${key}>\n${renderParamValue(value)}\n</parameter>\n`;
  }
  return `${out}</function>\n</tool_call>`;
}

const ASSISTANT_OPEN = `${IM_START}assistant\n${EMPTY_THINK}`;

/**
 * Variabler Prompt-Teil: frühere Turns, aktuelle Frage, Tool-Runden dieser
 * Frage und die Einleitung der nächsten Antwort.
 *
 * Qwen3.5 ist ein Hybrid-Modell mit rekurrentem Zustand: Die Engine kann
 * gerechnete Token nicht teilweise verwerfen, nur ab dem Prefix-Checkpoint neu
 * rechnen. Ein Folge-Prompt ist deshalb nur dann billig, wenn er den vorigen
 * Wort für Wort fortsetzt. Frühere Turns werden daher genau so geschrieben, wie
 * das Modell sie erzeugt hat — mit Denk-Block, Tool-Runden und unverändertem
 * Rohtext (`raw`), statt sie neu zu formatieren.
 *
 * @param {Array<{user:string, rounds?:Array, reply:string}>} turns  abgeschlossene Turns
 * @param {string} userText  aktuelle Nutzernachricht
 * @param {Array<{raw?:string, content?:string, toolCalls:Array, results:Array<string>}>} rounds  Tool-Runden dieser Frage
 */
export function buildConversationSuffix(turns, userText, rounds = []) {
  let out = '';
  for (const turn of turns) {
    out += renderUser(turn.user);
    out += renderRounds(turn.rounds || []);
    out += `${ASSISTANT_OPEN}${turn.reply}${IM_END}\n`;
  }
  out += renderUser(userText);
  out += renderRounds(rounds);
  return `${out}${ASSISTANT_OPEN}`;
}

function renderUser(text) {
  return `${IM_START}user\n${String(text).trim()}${IM_END}\n`;
}

function renderRounds(rounds) {
  let out = '';
  for (const round of rounds) {
    out += ASSISTANT_OPEN;
    if (typeof round.raw === 'string') {
      // Rohtext endet direkt vor dem Stop-Text "</tool_call>".
      out += `${round.raw}${TOOL_CALL_STOP}`;
    } else {
      const content = (round.content || '').trim();
      out += content;
      round.toolCalls.forEach((call, i) => {
        out += (i === 0 && content ? '\n\n' : i === 0 ? '' : '\n') + renderToolCall(call);
      });
    }
    out += `${IM_END}\n${IM_START}user`;
    for (const result of round.results) out += `\n<tool_response>\n${result}\n</tool_response>`;
    out += `${IM_END}\n`;
  }
  return out;
}

function parseValue(raw) {
  const text = raw.replace(/^\n/, '').replace(/\n$/, '');
  const trimmed = text.trim();
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if (trimmed === 'true' || trimmed === 'false') return trimmed === 'true';
  if (trimmed === 'null') return null;
  if (/^[[{]/.test(trimmed)) {
    try { return JSON.parse(trimmed); } catch { /* Text bleibt Text */ }
  }
  return trimmed;
}

/**
 * Zerlegt eine Modellantwort in Text und Tool-Calls.
 * Die Engine stoppt vor "</tool_call>" — ein offener letzter Block ist normal.
 *
 * @returns {{ content: string, toolCalls: Array<{name:string, arguments:object}> }}
 */
export function parseModelOutput(text) {
  const raw = stripReasoning(String(text || ''));
  const start = raw.indexOf('<tool_call>');
  if (start === -1) return { content: raw.trim(), toolCalls: [] };

  const content = raw.slice(0, start).trim();
  const toolCalls = [];
  const blocks = raw.slice(start).split('<tool_call>').slice(1);
  for (const block of blocks) {
    const fn = block.match(/<function=([\w.-]+)>/);
    if (!fn) continue;
    const args = {};
    const paramRe = /<parameter=([\w.-]+)>([\s\S]*?)(?:<\/parameter>|(?=<parameter=)|(?=<\/function>)|$)/g;
    let m;
    while ((m = paramRe.exec(block)) !== null) {
      args[m[1]] = parseValue(m[2]);
    }
    toolCalls.push({ name: fn[1], arguments: args });
  }
  return { content, toolCalls };
}

/** Entfernt Denk-Blöcke (auch einen noch offenen am Ende). */
export function stripReasoning(text) {
  return String(text || '')
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/<think>[\s\S]*$/, '')
    .replace(/^\s*<\/think>/, '');
}

const HOLD_BACK_MARKERS = ['<tool_call>', '<think>'];

/**
 * Anzeigbarer Teil einer noch laufenden Antwort: ohne Denk-Blöcke, ohne
 * Tool-Calls — und ohne ein angefangenes Markup am Ende, das sich erst mit dem
 * nächsten Stück als "<tool_call>" herausstellen könnte.
 */
export function visibleStreamingText(raw) {
  let text = stripReasoning(raw);
  const toolAt = text.indexOf('<tool_call>');
  if (toolAt !== -1) return text.slice(0, toolAt).trimStart();
  for (const marker of HOLD_BACK_MARKERS) {
    for (let len = Math.min(marker.length - 1, text.length); len > 0; len--) {
      if (text.endsWith(marker.slice(0, len))) {
        text = text.slice(0, text.length - len);
        break;
      }
    }
  }
  return text.trimStart();
}
