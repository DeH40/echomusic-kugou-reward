const PLUGIN_VERSION = "0.5.0";
const APP_ID = 3116;
const CLIENT_VERSION = 11436;
const LISTEN_CLIENT_VERSION = 10566;
const SIGN_SECRET = "LnT6xpN3khm36zse0QzvmgTZ3waWdRSA";
const GATEWAY_URL = "https://gateway.kugou.com";
const VIP_URL = "https://kugouvip.kugou.com";
const SOURCE_ID = 90137;
const AD_ID = 12307537187;
const AD_PLAY_MS = 30000;
const DEFAULT_USER_AGENT = "Android15-1070-11083-46-0-DiscoveryDRADProtocol-wifi";
const LISTEN_USER_AGENT = "Android13-1070-10566-201-0-ReportPlaySongToServerProtocol-wifi";
const LISTEN_ALREADY_CODE = 130012;
const AD_EXHAUSTED_CODE = 30002;
const STORAGE_KEY = "echomusicState";
const MAX_LOGS = 80;
const MAX_REQUEST_ATTEMPTS = 3;
const activeInstances = new Set();

const STORAGE_SCHEMA_VERSION = 2;
const TASK_IDS = Object.freeze(["dailyClaim", "listenReward", "adReward", "vipStatus"]);
const TASK_LABELS = Object.freeze({
  dailyClaim: "每日奖励领取",
  listenReward: "听歌奖励",
  adReward: "广告奖励",
  vipStatus: "VIP 状态",
});
const TASK_DONE_STATES = new Set(["success", "already", "exhausted"]);

function unwrap(value) {
  if (value && typeof value === "object" && "value" in value) return value.value;
  return value;
}

function firstValue(values) {
  return values.map(unwrap).find((value) => value !== undefined && value !== null && String(value).trim() !== "");
}

function todayKey(now = Date.now()) {
  const date = new Date(now);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function validMixsongId(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? String(Math.trunc(numeric)) : "";
}

function normalizeTrackSnapshot(value, explicitId = "") {
  const unwrapped = unwrap(value);
  const source = unwrapped && typeof unwrapped === "object"
    ? unwrap(unwrapped.track) || unwrap(unwrapped.song) || unwrap(unwrapped.currentTrack) || unwrapped
    : {};
  const id = validMixsongId(firstValue([explicitId, source.mixSongId, source.mixsongid, source.mix_song_id, source.album_audio_id, source.albumAudioId, source.trackId, source.id]));
  const title = String(firstValue([source.songName, source.songname, source.name, source.title]) || "").trim();
  const artist = String(firstValue([source.singerName, source.singername, source.artist, source.author, source.singer]) || "").trim();
  return { id, title, artist, confidence: id ? "high" : "none" };
}

function createTaskRecord(id, max = 0) {
  return { id, status: "pending", attempts: 0, completed: 0, total: max, progress: max > 0 ? 0 : null, lastAttemptAt: 0, completedAt: 0, error: "", detail: "等待执行", expiry: "", trackId: "" };
}

function clampInt(value, fallback, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(numeric)));
}

function defaultSettings(stored = {}) {
  const source = stored.settings || stored || {};
  return {
    autoDailyClaim: Boolean(source.autoDailyClaim ?? source.autoOpenCheckin ?? source.autoCheckin ?? true),
    autoAd: Boolean(source.autoAd ?? source.autoOpenAd ?? true),
    autoListenReward: source.autoListenReward !== false,
    manualMixsongId: validMixsongId(source.manualMixsongId ?? source.mixsongId),
    adMaxTimes: clampInt(source.adMaxTimes, 8, 1, 8),
    adDelaySeconds: clampInt(source.adDelaySeconds, 30, 5, 120),
    requestTimeoutSeconds: clampInt(source.requestTimeoutSeconds, 20, 5, 120),
  };
}

function createEmptyLedger(date = todayKey(), settings = defaultSettings()) {
  return {
    date,
    lastRunAt: 0,
    tasks: {
      dailyClaim: createTaskRecord("dailyClaim"),
      listenReward: createTaskRecord("listenReward"),
      adReward: createTaskRecord("adReward", settings.adMaxTimes),
      vipStatus: createTaskRecord("vipStatus"),
    },
  };
}

function migrateState(stored = {}, now = Date.now()) {
  const settings = defaultSettings(stored);
  const date = todayKey(now);
  const oldLedger = stored.ledger && typeof stored.ledger === "object" ? stored.ledger : null;
  const base = createEmptyLedger(date, settings);
  const ledger = oldLedger?.date === date ? { ...base, ...oldLedger, tasks: { ...base.tasks, ...(oldLedger.tasks || {}) } } : base;
  ledger.tasks.adReward.total = settings.adMaxTimes;
  if (ledger.tasks.adReward.completed > settings.adMaxTimes) ledger.tasks.adReward.completed = settings.adMaxTimes;
  if (ledger.tasks.adReward.status === "success" && ledger.tasks.adReward.completed < settings.adMaxTimes) ledger.tasks.adReward.status = "pending";
  const logs = Array.isArray(stored.logs)
    ? stored.logs.slice(-MAX_LOGS).map((entry) => typeof entry === "string"
      ? { at: 0, level: "info", message: entry, task: "" }
      : { at: Number(entry?.at) || 0, level: entry?.level || "info", message: String(entry?.message || ""), task: String(entry?.task || "") }).filter((entry) => entry.message)
    : [];
  return {
    schemaVersion: STORAGE_SCHEMA_VERSION,
    settings,
    ledger,
    logs,
    diagnostics: { hostAdapter: "unknown", lastStartupAt: Number(stored.diagnostics?.lastStartupAt) || 0, lastSuccessAt: Number(stored.diagnostics?.lastSuccessAt) || 0, lastError: String(stored.diagnostics?.lastError || "") },
  };
}

function serializeState(state) {
  return { schemaVersion: STORAGE_SCHEMA_VERSION, settings: { ...state.settings }, ledger: JSON.parse(JSON.stringify(state.ledger)), logs: state.logs.slice(-MAX_LOGS).map((entry) => ({ ...entry })), diagnostics: { ...state.diagnostics } };
}

function taskIsDone(task) {
  return Boolean(task && TASK_DONE_STATES.has(task.status));
}

function deriveDashboard(state) {
  const settings = state.settings;
  const tasks = TASK_IDS.map((id) => {
    const task = state.ledger.tasks[id] || createTaskRecord(id);
    const enabled = id === "dailyClaim" ? settings.autoDailyClaim : id === "adReward" ? settings.autoAd : id === "listenReward" ? settings.autoListenReward : true;
    const statusText = task.status === "success" ? "已完成" : task.status === "already" ? "今日已领取" : task.status === "exhausted" ? "今日次数已用尽" : task.status === "running" ? "执行中" : task.status === "waiting" ? "等待下一次" : task.status === "failed" ? "待重试" : task.status === "cancelled" ? "已停止" : enabled ? "待执行" : "已关闭";
    let detail = enabled ? task.detail || "等待执行" : "自动任务已关闭";
    if (id === "adReward") detail = `${task.completed || 0}/${task.total || settings.adMaxTimes} 次`;
    if (["running", "waiting"].includes(task.status) && id === "adReward") detail = `${task.completed || 0}/${task.total || settings.adMaxTimes} 次 · 间隔 ${settings.adDelaySeconds} 秒`;
    if (task.status === "failed" && task.error) detail = task.error;
    if (id === "vipStatus" && task.expiry) detail = `有效至 ${task.expiry}`;
    if (id === "listenReward" && task.trackId) detail = `${task.trackId}${task.detail ? ` · ${task.detail}` : ""}`;
    return { id, label: TASK_LABELS[id], enabled, status: enabled ? task.status : "disabled", statusText: enabled ? statusText : "已关闭", detail, progress: task.progress, completed: task.completed || 0, total: task.total || 0, expiry: task.expiry || "", trackId: task.trackId || "", error: task.error || "" };
  });
  const countable = tasks.filter((task) => task.enabled && task.id !== "vipStatus");
  return { date: state.ledger.date, completed: countable.filter((task) => TASK_DONE_STATES.has(task.status)).length, total: countable.length, tasks, lastRunAt: state.ledger.lastRunAt };
}

function normalizeApiOutcome(payload, { alreadyCodes = [], exhaustedCodes = [] } = {}) {
  const errorCode = Number(payload?.error_code);
  const message = String(payload?.msg || payload?.message || payload?.error_msg || payload?.data?.msg || "").trim();
  if (alreadyCodes.includes(errorCode)) return { kind: "already", errorCode, message: message || "今日已领取", payload };
  if (exhaustedCodes.includes(errorCode)) return { kind: "exhausted", errorCode, message: message || "今日次数已用尽", payload };
  if (String(payload?.status) === "0" || (payload?.error_code !== undefined && errorCode !== 0)) return { kind: "failure", errorCode, message: message || `接口返回状态码 ${payload?.status ?? errorCode}`, payload };
  return { kind: "success", errorCode: Number.isFinite(errorCode) ? errorCode : 0, message: message || "接口已返回成功", payload };
}

function trackEventKey(trackId, sessionId, date = todayKey()) {
  const id = validMixsongId(trackId);
  return id && sessionId ? `${date}:${sessionId}:${id}` : "";
}

function formatExpire(value) {
  if (value === undefined || value === null || value === "") return "未返回到期时间";
  const numeric = Number(value);
  const date = Number.isFinite(numeric) ? new Date(numeric < 100000000000 ? numeric * 1000 : numeric) : new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function utf8Bytes(value) {
  const encoded = encodeURIComponent(String(value));
  const bytes = [];
  for (let index = 0; index < encoded.length; index += 1) {
    if (encoded[index] === "%") {
      bytes.push(parseInt(encoded.slice(index + 1, index + 3), 16));
      index += 2;
    } else {
      bytes.push(encoded.charCodeAt(index));
    }
  }
  return bytes;
}

function md5(value) {
  const input = utf8Bytes(value);
  const wordCount = (((input.length + 8) >> 6) + 1) * 16;
  const words = new Uint32Array(wordCount);
  for (let index = 0; index < input.length; index += 1) {
    words[index >> 2] |= input[index] << ((index & 3) * 8);
  }
  words[input.length >> 2] |= 0x80 << ((input.length & 3) * 8);
  const bitLength = input.length * 8;
  words[wordCount - 2] = bitLength >>> 0;
  words[wordCount - 1] = Math.floor(bitLength / 0x100000000) >>> 0;

  const shifts = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
  ];
  const constants = [];
  for (let index = 0; index < 64; index += 1) {
    constants[index] = Math.floor(Math.abs(Math.sin(index + 1)) * 0x100000000) >>> 0;
  }

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;
  const rotateLeft = (number, amount) => (number << amount) | (number >>> (32 - amount));

  for (let offset = 0; offset < words.length; offset += 16) {
    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;
    for (let index = 0; index < 64; index += 1) {
      let fn;
      let wordIndex;
      if (index < 16) {
        fn = (b & c) | (~b & d);
        wordIndex = index;
      } else if (index < 32) {
        fn = (d & b) | (~d & c);
        wordIndex = (5 * index + 1) % 16;
      } else if (index < 48) {
        fn = b ^ c ^ d;
        wordIndex = (3 * index + 5) % 16;
      } else {
        fn = c ^ (b | ~d);
        wordIndex = (7 * index) % 16;
      }
      const next = (a + fn + constants[index] + words[offset + wordIndex]) >>> 0;
      a = d;
      d = c;
      c = b;
      b = (b + rotateLeft(next, shifts[index])) >>> 0;
    }
    a0 = (a0 + a) >>> 0;
    b0 = (b0 + b) >>> 0;
    c0 = (c0 + c) >>> 0;
    d0 = (d0 + d) >>> 0;
  }

  const hex = (number) => {
    let result = "";
    for (let index = 0; index < 4; index += 1) {
      result += ((number >>> (index * 8)) & 0xff).toString(16).padStart(2, "0");
    }
    return result;
  };
  return hex(a0) + hex(b0) + hex(c0) + hex(d0);
}

function stringifyParam(value) {
  return value !== null && typeof value === "object" ? JSON.stringify(value) : String(value);
}

function queryString(params) {
  return Object.keys(params)
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(stringifyParam(params[key]))}`)
    .join("&");
}

function signature(params, body) {
  const canonical = Object.keys(params)
    .sort()
    .map((key) => `${key}=${stringifyParam(params[key])}`)
    .join("");
  return md5(`${SIGN_SECRET}${canonical}${body || ""}${SIGN_SECRET}`);
}

function wait(milliseconds, signal) {
  if (signal?.aborted) return Promise.resolve(false);
  return new Promise((resolve) => {
    let timer;
    const finish = (completed) => {
      clearTimeout(timer);
      signal?.removeEventListener?.("abort", onAbort);
      resolve(completed);
    };
    const onAbort = () => finish(false);
    timer = setTimeout(() => finish(true), milliseconds);
    signal?.addEventListener?.("abort", onAbort, { once: true });
  });
}

function createLinkedSignal(parentSignal, timeoutMs) {
  if (typeof AbortController !== "function") return { signal: parentSignal, dispose: () => {} };
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  parentSignal?.addEventListener?.("abort", onAbort, { once: true });
  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timer);
      parentSignal?.removeEventListener?.("abort", onAbort);
    },
  };
}

function cancelledError(message = "任务已停止") {
  const error = new Error(message);
  error.cancelled = true;
  error.retryable = false;
  return error;
}

class GatewayError extends Error {
  constructor(message, { retryable = false, cancelled = false, code = "" } = {}) {
    super(message);
    this.name = "GatewayError";
    this.retryable = retryable;
    this.cancelled = cancelled;
    this.code = code;
  }
}

function readRef(value) {
  return value && typeof value === "object" && "value" in value ? value.value : value;
}

function findNestedValue(value, keys, depth = 0, visited = new Set()) {
  const source = readRef(value);
  if (!source || typeof source !== "object" || depth > 5 || visited.has(source)) return undefined;
  visited.add(source);
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null && source[key] !== "") return readRef(source[key]);
  }
  for (const key of Object.keys(source)) {
    const found = findNestedValue(source[key], keys, depth + 1, visited);
    if (found !== undefined) return found;
  }
  return undefined;
}

function readAuth(ctx) {
  const state = ctx?.pinia?.state?.value
    || ctx?.pinia?.state
    || ctx?.app?.config?.globalProperties?.$pinia?.state?.value
    || {};
  const user = state.user || state.userStore || state.account || {};
  const device = state.device || state.deviceStore || {};
  const info = user.info || user.userInfo || user.account || user;
  const deviceInfo = device.info || device.device || device;
  const token = findNestedValue(info, ["token", "kgToken", "kg_token"]);
  const userid = findNestedValue(info, ["userid", "userId", "uid"]);
  const dfid = findNestedValue(deviceInfo, ["dfid", "dfidValue"]) || "-";
  if (!token || !userid) throw new GatewayError("没有读取到 EchoMusic 当前酷狗登录态，请先登录后再试", { code: "AUTH_REQUIRED" });
  return { token: String(token), userid: String(userid), dfid: String(dfid) };
}

function trackFromPlayer(ctx) {
  const player = ctx?.player || ctx?.stores?.player;
  if (!player) return normalizeTrackSnapshot(null);
  const track = readRef(player.currentTrack)
    || readRef(player.store?.currentTrackSnapshot)
    || readRef(player.currentTrackSnapshot);
  const id = readRef(player.currentTrackId);
  return normalizeTrackSnapshot(track, id);
}

class EchoMusicHostAdapter {
  constructor(ctx, { onTrackChange, onEnded, onPlaybackChange }) {
    this.ctx = ctx;
    this.onTrackChange = onTrackChange;
    this.onEnded = onEnded;
    this.onPlaybackChange = onPlaybackChange;
    this.disposers = [];
    this.currentTrack = trackFromPlayer(ctx);
    this.session = 0;
    this.supported = false;
    this.lastPlaying = false;
  }

  start() {
    const events = this.ctx?.events || {};
    const bind = (name, callback) => {
      if (typeof events[name] !== "function") return false;
      try {
        const disposer = events[name](callback);
        if (typeof disposer === "function") this.disposers.push(disposer);
        return true;
      } catch {
        return false;
      }
    };

    const trackSupported = bind("onTrackChange", (snapshot) => {
      const next = normalizeTrackSnapshot(snapshot, trackFromPlayer(this.ctx).id);
      if (next.id && next.id !== this.currentTrack.id) this.session += 1;
      this.currentTrack = next.id ? next : trackFromPlayer(this.ctx);
      this.onTrackChange?.(this.currentTrack, this.session);
    });
    const endedSupported = bind("onEnded", (payload) => {
      const payloadTrack = normalizeTrackSnapshot(payload, this.currentTrack.id);
      const track = payloadTrack.id ? payloadTrack : this.currentTrack;
      this.onEnded?.(track, this.session);
    });
    const playbackSupported = bind("onPlaybackChange", (playing) => {
      const value = Boolean(readRef(playing));
      this.lastPlaying = value;
      this.onPlaybackChange?.(value);
    });
    this.supported = trackSupported || endedSupported || playbackSupported;
    if (!this.currentTrack.id) this.currentTrack = trackFromPlayer(this.ctx);
    return this.supported;
  }

  getCurrentTrack() {
    const fromPlayer = trackFromPlayer(this.ctx);
    if (fromPlayer.id) this.currentTrack = fromPlayer;
    return { ...this.currentTrack };
  }

  getSnapshot() {
    const player = this.ctx?.player || this.ctx?.stores?.player;
    return {
      track: this.getCurrentTrack(),
      isPlaying: Boolean(readRef(player?.isPlaying)),
      currentTime: Number(readRef(player?.currentTime)) || 0,
      duration: Number(readRef(player?.duration)) || 0,
      session: this.session,
      supported: this.supported,
    };
  }

  dispose() {
    for (const disposer of this.disposers.splice(0).reverse()) {
      try { disposer(); } catch { /* 宿主会再次执行统一资源清理 */ }
    }
  }
}

export class KugouRewardGateway {
  constructor({ ctx, authProvider, timeoutSeconds, log }) {
    this.ctx = ctx;
    this.authProvider = authProvider;
    this.timeoutSeconds = timeoutSeconds;
    this.log = log;
  }

  async request({
    baseUrl = GATEWAY_URL,
    path,
    method = "GET",
    params = {},
    data,
    headers = {},
    alreadyCodes = [],
    exhaustedCodes = [],
    signal,
    task = "",
  }) {
    let lastError;
    for (let attempt = 1; attempt <= MAX_REQUEST_ATTEMPTS; attempt += 1) {
      if (signal?.aborted) throw cancelledError();
      const auth = this.authProvider();
      const clienttime = Math.floor(Date.now() / 1000);
      const dfid = auth.dfid || "-";
      const baseMid = md5(dfid);
      const mid = `${baseMid}${baseMid.slice(0, 7)}`;
      const allParams = {
        dfid,
        mid,
        uuid: md5(`${dfid}${mid}`),
        appid: APP_ID,
        clientver: CLIENT_VERSION,
        userid: auth.userid,
        clienttime,
        ...params,
      };
      if (auth.token) allParams.token = auth.token;
      const body = data === undefined ? "" : JSON.stringify(data);
      allParams.signature = signature(allParams, body);
      const url = `${baseUrl}${path}?${queryString(allParams)}`;
      const linked = createLinkedSignal(signal, this.timeoutSeconds * 1000);
      try {
        const response = await this.ctx.net.fetch(url, {
          method,
          headers: {
            Accept: "application/json",
            "User-Agent": DEFAULT_USER_AGENT,
            dfid,
            mid,
            clienttime: String(clienttime),
            ...headers,
          },
          signal: linked.signal,
          ...(data === undefined ? {} : { body }),
        });
        let payload;
        try {
          payload = await response.json();
        } catch {
          throw new GatewayError(`酷狗接口返回了无法解析的响应（HTTP ${response?.status || "?"}）`, {
            retryable: Number(response?.status) >= 500,
          });
        }
        if (response?.ok === false || (response?.status && response.status >= 400)) {
          throw new GatewayError(`酷狗接口 HTTP ${response.status}`, { retryable: response.status >= 500 });
        }
        const outcome = normalizeApiOutcome(payload, { alreadyCodes, exhaustedCodes });
        if (outcome.kind === "failure") {
          throw new GatewayError(outcome.message, { retryable: false, code: outcome.errorCode });
        }
        return { ...outcome, attempts: attempt };
      } catch (error) {
        if (signal?.aborted || linked.signal?.aborted && signal?.aborted) throw cancelledError();
        if (linked.signal?.aborted && !signal?.aborted) {
          lastError = new GatewayError(`请求超时（${this.timeoutSeconds} 秒）`, { retryable: true, code: "TIMEOUT" });
        } else {
          lastError = error instanceof GatewayError
            ? error
            : new GatewayError(error?.message || String(error), { retryable: true });
        }
        if (lastError.retryable === false || attempt === MAX_REQUEST_ATTEMPTS) throw lastError;
        const seconds = attempt;
        await this.log?.("warn", `网络请求失败，${seconds} 秒后重试（${attempt}/${MAX_REQUEST_ATTEMPTS}）：${lastError.message}`, task);
        if (!(await wait(seconds * 1000, signal))) throw cancelledError();
      } finally {
        linked.dispose();
      }
    }
    throw lastError || new GatewayError("酷狗接口请求失败");
  }

  dailyClaim(signal) {
    return this.request({
      path: "/youth/v1/recharge/receive_vip_listen_song",
      method: "POST",
      params: { source_id: SOURCE_ID },
      alreadyCodes: [LISTEN_ALREADY_CODE],
      signal,
      task: "dailyClaim",
    });
  }

  listenReport(mixsongid, signal) {
    return this.request({
      path: "/youth/v2/report/listen_song",
      method: "POST",
      params: { clientver: LISTEN_CLIENT_VERSION },
      data: { mixsongid: Number(mixsongid) },
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "User-Agent": LISTEN_USER_AGENT,
      },
      alreadyCodes: [LISTEN_ALREADY_CODE],
      signal,
      task: "listenReward",
    });
  }

  adReport(signal) {
    const now = Date.now();
    return this.request({
      path: "/youth/v1/ad/play_report",
      method: "POST",
      data: { ad_id: AD_ID, play_end: now, play_start: now - AD_PLAY_MS },
      headers: { "Content-Type": "application/json; charset=utf-8" },
      exhaustedCodes: [AD_EXHAUSTED_CODE],
      signal,
      task: "adReward",
    });
  }

  async vipStatus(signal) {
    const result = await this.request({
      baseUrl: VIP_URL,
      path: "/v1/get_union_vip",
      params: { busi_type: "concept" },
      signal,
      task: "vipStatus",
    });
    const payload = result.payload;
    const expiry = payload?.data?.busi_vip?.[0]?.vip_end_time
      ?? findNestedValue(payload, ["vip_end_time", "end_time", "expire_time", "vipEndTime"]);
    return { ...result, expiry: formatExpire(expiry) };
  }
}

export class RewardTaskEngine {
  constructor({ state, gateway, save, log, notify, emit }) {
    this.state = state;
    this.gateway = gateway;
    this.save = save;
    this.log = log;
    this.notify = notify;
    this.emit = emit;
    this.running = new Map();
  }

  isRunning(taskId) {
    return this.running.has(taskId);
  }

  isAnythingRunning() {
    return this.running.size > 0;
  }

  currentRuns() {
    return Array.from(this.running.entries()).map(([id, run]) => ({
      id,
      label: TASK_LABELS[id],
      startedAt: run.startedAt,
      cancelable: true,
    }));
  }

  updateTask(taskId, patch, persist = true) {
    const task = this.state.ledger.tasks[taskId];
    if (!task) return;
    Object.assign(task, patch);
    this.emit();
    if (persist) void this.save();
  }

  async run(taskId, input = {}, { force = false } = {}) {
    if (!TASK_IDS.includes(taskId)) throw new Error(`未知任务：${taskId}`);
    if (this.running.has(taskId)) {
      this.notify("info", `${TASK_LABELS[taskId]}正在执行中`);
      return { kind: "running", taskId };
    }
    const task = this.state.ledger.tasks[taskId];
    if (!force && taskIsDone(task) && taskId !== "vipStatus") {
      return { kind: task.status, taskId, skipped: true };
    }
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    this.running.set(taskId, { controller, startedAt: Date.now() });
    this.updateTask(taskId, {
      status: "running",
      attempts: (task.attempts || 0) + 1,
      lastAttemptAt: Date.now(),
      error: "",
      detail: "正在执行",
    });
    this.state.ledger.lastRunAt = Date.now();
    await this.save();
    try {
      let result;
      if (taskId === "dailyClaim") result = await this.gateway.dailyClaim(controller?.signal);
      else if (taskId === "listenReward") result = await this.runListen(input, controller?.signal);
      else if (taskId === "adReward") result = await this.runAds(controller?.signal);
      else if (taskId === "vipStatus") result = await this.gateway.vipStatus(controller?.signal);
      else throw new Error(`未实现任务：${taskId}`);

      this.applyResult(taskId, result, input);
      const message = result.kind === "already"
        ? `${TASK_LABELS[taskId]}：今日已完成`
        : result.kind === "exhausted"
          ? `${TASK_LABELS[taskId]}：今日次数已用尽`
          : `${TASK_LABELS[taskId]}：执行成功`;
      await this.log("success", message, taskId);
      this.notify("success", message);
      return { ...result, taskId };
    } catch (error) {
      const cancelled = Boolean(error?.cancelled || controller?.signal?.aborted);
      const message = cancelled ? "任务已停止" : (error?.message || String(error));
      this.updateTask(taskId, {
        status: cancelled ? "cancelled" : "failed",
        error: cancelled ? "" : message,
        detail: cancelled ? "已停止，可继续执行" : "失败，可重试",
      });
      this.state.diagnostics.lastError = cancelled ? "" : message;
      await this.log(cancelled ? "info" : "error", `${TASK_LABELS[taskId]}：${message}`, taskId);
      if (!cancelled) this.notify("danger", message);
      return { kind: cancelled ? "cancelled" : "failure", taskId, error: message };
    } finally {
      this.running.delete(taskId);
      this.emit();
      await this.save();
    }
  }

  async runListen(input, signal) {
    const trackId = validMixsongId(input.trackId || this.state.settings.manualMixsongId);
    if (!trackId) throw new Error("没有识别到当前歌曲，请播放一首歌后重试，或在高级设置中指定 MixSongID");
    this.updateTask("listenReward", { trackId, detail: `上报歌曲 ${trackId}` });
    return this.gateway.listenReport(trackId, signal);
  }

  async runAds(signal) {
    const task = this.state.ledger.tasks.adReward;
    const total = clampInt(this.state.settings.adMaxTimes, 8, 1, 8);
    const delaySeconds = clampInt(this.state.settings.adDelaySeconds, 30, 5, 120);
    let completed = Math.min(Number(task.completed) || 0, total);
    let attempted = completed;
    this.updateTask("adReward", { total, completed, progress: total ? completed / total : 0, detail: `${completed}/${total} 次` });
    if (completed >= total) return { kind: "success", completed, total };

    for (let index = completed + 1; index <= total; index += 1) {
      if (signal?.aborted) throw cancelledError();
      attempted = index;
      this.updateTask("adReward", { status: "running", total, completed, progress: completed / total, detail: `第 ${index}/${total} 次` });
      const result = await this.gateway.adReport(signal);
      if (result.kind === "exhausted") {
        this.updateTask("adReward", { status: "exhausted", total, completed, progress: completed / total, detail: "今日次数已用尽" });
        return { ...result, completed, total, attempted };
      }
      completed += 1;
      this.updateTask("adReward", { status: "running", total, completed, progress: completed / total, detail: `${completed}/${total} 次已完成` });
      if (index < total) {
        this.updateTask("adReward", { status: "waiting", detail: `${completed}/${total} 次 · 等待 ${delaySeconds} 秒` });
        if (!(await wait(delaySeconds * 1000, signal))) throw cancelledError();
      }
    }
    return { kind: "success", completed, total, attempted };
  }

  applyResult(taskId, result, input = {}) {
    const status = result.kind === "already"
      ? "already"
      : result.kind === "exhausted"
        ? "exhausted"
        : "success";
    const patch = {
      status,
      completedAt: Date.now(),
      error: "",
      detail: result.kind === "already" ? "今日已领取" : result.kind === "exhausted" ? "今日次数已用尽" : "已完成",
    };
    if (taskId === "adReward") {
      const total = result.total || this.state.settings.adMaxTimes;
      patch.total = total;
      patch.completed = result.completed ?? total;
      patch.progress = total ? patch.completed / total : 1;
      patch.detail = `${patch.completed}/${total} 次`;
    }
    if (taskId === "listenReward") patch.trackId = validMixsongId(input.trackId || this.state.settings.manualMixsongId);
    if (taskId === "vipStatus") patch.expiry = result.expiry || "未返回到期时间";
    this.updateTask(taskId, patch, false);
    if (status === "success" || status === "already" || status === "exhausted") {
      this.state.diagnostics.lastSuccessAt = Date.now();
    }
  }

  async runMissing() {
    const results = [];
    if (this.state.settings.autoDailyClaim && !taskIsDone(this.state.ledger.tasks.dailyClaim)) {
      results.push(await this.run("dailyClaim"));
    }
    const ad = this.state.ledger.tasks.adReward;
    if (this.state.settings.autoAd && !taskIsDone(ad)) {
      results.push(await this.run("adReward"));
    }
    return results;
  }

  cancelAll() {
    let count = 0;
    for (const run of this.running.values()) {
      run.controller?.abort?.();
      count += 1;
    }
    return count;
  }
}

class PluginRuntime {
  constructor(ctx) {
    this.ctx = ctx;
    this.state = null;
    this.statusText = "正在初始化…";
    this.authState = { status: "unknown", message: "尚未检查" };
    this.host = null;
    this.gateway = null;
    this.engine = null;
    this.listeners = new Set();
    this.saveChain = Promise.resolve();
    this.startupTimer = null;
    this.disposed = false;
    this.handledTrackEvents = new Set();
  }

  async start() {
    const stored = await this.ctx.storage.get(STORAGE_KEY);
    this.state = migrateState(stored || {});
    this.emit = () => {
      for (const listener of this.listeners) listener(this.snapshot());
    };
    this.gateway = new KugouRewardGateway({
      ctx: this.ctx,
      authProvider: () => this.getAuth(),
      timeoutSeconds: this.state.settings.requestTimeoutSeconds,
      log: (level, message, task) => this.log(level, message, task),
    });
    this.engine = new RewardTaskEngine({
      state: this.state,
      gateway: this.gateway,
      save: () => this.saveState(),
      log: (level, message, task) => this.log(level, message, task),
      notify: (type, message) => this.notify(type, message),
      emit: () => this.emit(),
    });
    this.host = new EchoMusicHostAdapter(this.ctx, {
      onTrackChange: (track) => this.handleTrackChange(track),
      onEnded: (track, session) => this.handleTrackEnded(track, session),
      onPlaybackChange: () => this.emit(),
    });
    const hostSupported = this.host.start();
    this.state.diagnostics.hostAdapter = hostSupported ? "official-events" : "unavailable";
    this.setStatus(hostSupported ? "已就绪，等待今日任务检查" : "宿主播放器事件不可用");
    this.registerSettings();
    this.ctx.dispose?.(() => this.dispose());
    await this.log("info", `酷狗奖励助手 ${PLUGIN_VERSION} 已启动（${hostSupported ? "官方播放器事件" : "宿主事件不可用"}）`);
    this.scheduleStartup();
    this.emit();
  }

  getAuth() {
    try {
      const auth = readAuth(this.ctx);
      this.authState = { status: "ready", message: "已读取 EchoMusic 登录态" };
      return auth;
    } catch (error) {
      this.authState = { status: "missing", message: error.message };
      throw error;
    } finally {
      this.emit?.();
    }
  }

  async waitForAuth(maxAttempts = 5) {
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        this.getAuth();
        return true;
      } catch {
        if (attempt < maxAttempts - 1) await wait(1000);
      }
    }
    return false;
  }

  scheduleStartup() {
    clearTimeout(this.startupTimer);
    this.startupTimer = setTimeout(() => void this.runStartup(), 350);
  }

  async runStartup() {
    if (this.disposed || (!this.state.settings.autoDailyClaim && !this.state.settings.autoAd)) return;
    this.setStatus("正在检查今日未完成任务…");
    if (!(await this.waitForAuth())) {
      await this.log("warn", "未检测到酷狗登录态，今日自动任务暂未执行；登录后可点击重试");
      this.setStatus("请先登录酷狗，再重试今日任务");
      return;
    }
    this.state.diagnostics.lastStartupAt = Date.now();
    await this.saveState();
    const results = await this.engine.runMissing();
    const failed = results.filter((result) => result.kind === "failure").length;
    this.setStatus(failed ? "部分任务失败，可重试" : "今日自动任务检查完成");
    await this.log(failed ? "warn" : "info", `启动任务检查完成：${results.length} 项已处理${failed ? `，${failed} 项失败` : ""}`);
  }

  handleTrackChange(track) {
    if (track?.id) this.log("info", `当前歌曲：${track.title || "未命名歌曲"}${track.artist ? ` · ${track.artist}` : ""}（${track.id}）`, "listenReward");
    this.emit();
  }

  handleTrackEnded(track, session) {
    if (!this.state.settings.autoListenReward || this.disposed) return;
    const id = validMixsongId(this.state.settings.manualMixsongId || track?.id);
    if (!id) {
      void this.log("warn", "歌曲已播放完成，但没有可信 MixSongID，暂不自动上报", "listenReward");
      return;
    }
    const key = trackEventKey(id, session, todayKey());
    if (!key || this.handledTrackEvents.has(key)) return;
    if (this.handledTrackEvents.size > 50) this.handledTrackEvents.clear();
    this.handledTrackEvents.add(key);
    const task = this.state.ledger.tasks.listenReward;
    if (taskIsDone(task)) {
      void this.log("info", "今日听歌奖励已处理，跳过重复上报", "listenReward");
      return;
    }
    void this.log("info", `检测到歌曲自然结束，准备上报听歌奖励（${id}）`, "listenReward");
    void this.engine.run("listenReward", { trackId: id, title: track?.title || "" });
  }

  async runTask(taskId, input = {}, options = {}) {
    this.setStatus(`${TASK_LABELS[taskId]}：准备执行…`);
    const result = await this.engine.run(taskId, input, options);
    this.setStatus(result.kind === "failure" ? `${TASK_LABELS[taskId]}失败，可重试` : result.kind === "cancelled" ? "任务已停止" : "就绪");
    return result;
  }

  async runMissing() {
    this.setStatus("正在补领今日未完成项目…");
    const results = await this.engine.runMissing();
    this.setStatus("就绪");
    return results;
  }

  stopAll() {
    const count = this.engine.cancelAll();
    if (count) this.setStatus("正在停止任务…");
    else this.notify("info", "当前没有正在执行的任务");
    return count;
  }

  updateSetting(name, value) {
    if (!(name in this.state.settings)) return;
    this.state.settings[name] = value;
    if (name === "adMaxTimes") {
      const task = this.state.ledger.tasks.adReward;
      task.total = value;
      if (task.completed >= value) task.status = "success";
    }
    void this.saveState();
    this.emit();
  }

  registerSettings() {
    const { defineComponent, h, ref, onUnmounted } = this.ctx.vue;
    const runtime = this;
    const component = defineComponent({
      name: "EchoMusicKugouRewardDashboard",
      setup() {
        const snapshot = ref(runtime.snapshot());
        const manualMixsongId = ref(runtime.state.settings.manualMixsongId);
        const adMaxTimes = ref(String(runtime.state.settings.adMaxTimes));
        const adDelaySeconds = ref(String(runtime.state.settings.adDelaySeconds));
        const requestTimeoutSeconds = ref(String(runtime.state.settings.requestTimeoutSeconds));
        const unsubscribe = runtime.subscribe((next) => { snapshot.value = next; });
        onUnmounted?.(() => unsubscribe());

        const execute = (taskId, input = {}, options = {}) => {
          if (taskId === "missing") void runtime.runMissing();
          else void runtime.runTask(taskId, input, options);
        };
        const updateNumber = (name, refValue, min, max, fallback) => {
          const value = clampInt(refValue.value, fallback, min, max);
          refValue.value = String(value);
          runtime.updateSetting(name, value);
        };
        const button = (label, action, style, disabled = false, title = "") => h("button", {
          type: "button",
          onClick: action,
          disabled,
          title,
          style: {
            minHeight: "38px",
            padding: "8px 13px",
            border: "1px solid var(--border-subtle, rgba(128, 128, 128, .22))",
            borderRadius: "10px",
            background: style?.background || "var(--color-bg-elevated, rgba(128, 128, 128, .08))",
            color: style?.color || "var(--color-text-main, inherit)",
            fontSize: "13px",
            fontWeight: "750",
            cursor: disabled ? "not-allowed" : "pointer",
            opacity: disabled ? ".45" : "1",
            transition: "transform .16s ease, opacity .16s ease",
          },
        }, label);
        const card = (children, extra = {}) => h("div", {
          style: {
            padding: "15px",
            border: "1px solid var(--border-subtle, rgba(128, 128, 128, .16))",
            borderRadius: "15px",
            background: "var(--color-bg-elevated, rgba(128, 128, 128, .06))",
            ...extra,
          },
        }, children);
        const taskCard = (task) => {
          const tone = ["success", "already", "exhausted"].includes(task.status)
            ? "#16845b"
            : ["failed"].includes(task.status)
              ? "#c24135"
              : ["running", "waiting"].includes(task.status)
                ? "#b7791f"
                : "var(--color-text-main, #64748b)";
          return h("div", {
            key: task.id,
            style: {
              minWidth: "0",
              padding: "13px",
              borderRadius: "12px",
              border: "1px solid var(--border-subtle, rgba(128, 128, 128, .16))",
              background: "var(--color-bg-main, rgba(128, 128, 128, .025))",
            },
          }, [
            h("div", { style: { display: "flex", alignItems: "center", gap: "8px" } }, [
              h("span", { style: { width: "8px", height: "8px", flex: "0 0 auto", borderRadius: "50%", background: tone } }),
              h("strong", { style: { minWidth: "0", flex: "1", fontSize: "13px" } }, task.label),
              h("span", { style: { color: tone, fontSize: "11px", fontWeight: "800", whiteSpace: "nowrap" } }, task.statusText),
            ]),
            h("div", { style: { marginTop: "7px", minHeight: "18px", color: "var(--color-text-secondary, inherit)", opacity: ".74", fontSize: "12px", overflowWrap: "anywhere" } }, task.detail),
            task.progress !== null && task.progress !== undefined ? h("div", { style: { height: "4px", marginTop: "9px", overflow: "hidden", borderRadius: "999px", background: "var(--control-track-bg, rgba(128, 128, 128, .16))" } }, [
              h("div", { style: { width: `${Math.min(100, Math.max(0, task.progress * 100))}%`, height: "100%", borderRadius: "inherit", background: "var(--color-primary, #31cfa1)", transition: "width .2s ease" } }),
            ]) : null,
          ]);
        };

        return () => {
          const data = snapshot.value;
          const current = data.currentTrack;
          const running = data.running.length > 0;
          const enabledAutomation = [data.settings.autoDailyClaim, data.settings.autoAd, data.settings.autoListenReward].filter(Boolean).length;
          const statusColor = data.statusText.includes("失败") || data.statusText.includes("登录") ? "#c24135" : running ? "#b7791f" : "#16845b";
          const logs = data.logs.slice(-32).reverse().map((entry) => {
            const time = entry.at ? new Date(entry.at).toLocaleTimeString() : "--:--:--";
            return `[${time}] [${entry.level}] ${entry.message}`;
          }).join("\n");
          return h("div", {
            style: {
              width: "min(760px, 100%)",
              boxSizing: "border-box",
              margin: "0 auto",
              padding: "18px",
              color: "var(--color-text-main, inherit)",
              fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
              lineHeight: "1.55",
            },
          }, [
            card([
              h("div", { style: { display: "flex", alignItems: "flex-start", gap: "12px" } }, [
                h("div", { style: { display: "grid", placeItems: "center", width: "42px", height: "42px", flex: "0 0 auto", borderRadius: "13px", background: "var(--color-primary, #31cfa1)", color: "#08251d", fontSize: "22px", fontWeight: "900" } }, "♫"),
                h("div", { style: { minWidth: "0", flex: "1" } }, [
                  h("div", { style: { fontSize: "10px", letterSpacing: ".13em", fontWeight: "850", opacity: ".6" } }, "ECHOMUSIC · REWARD"),
                  h("h2", { style: { margin: "3px 0", fontSize: "21px", lineHeight: "1.2", fontWeight: "850" } }, "酷狗奖励助手"),
                  h("div", { style: { color: "var(--color-text-secondary, inherit)", opacity: ".72", fontSize: "12px" } }, "每日奖励领取 · 听歌上报 · 广告奖励"),
                ]),
                h("span", { style: { flex: "0 0 auto", padding: "4px 8px", borderRadius: "999px", background: "var(--color-primary, #31cfa1)", color: "#08251d", fontSize: "11px", fontWeight: "850" } }, `${data.dashboard.completed}/${data.dashboard.total}`),
              ]),
              h("div", { style: { display: "flex", flexWrap: "wrap", gap: "7px", marginTop: "15px", fontSize: "12px" } }, [
                h("span", { style: { padding: "5px 9px", borderRadius: "8px", background: "var(--control-hover-bg, rgba(128, 128, 128, .1))" } }, `自动化 ${enabledAutomation}/3 项`),
                h("span", { style: { padding: "5px 9px", borderRadius: "8px", background: "var(--control-hover-bg, rgba(128, 128, 128, .1))" } }, data.hostSupported ? "官方播放器事件已接入" : "播放器事件不可用"),
                h("span", { style: { padding: "5px 9px", borderRadius: "8px", background: "var(--control-hover-bg, rgba(128, 128, 128, .1))" } }, data.auth.status === "ready" ? "酷狗已登录" : "等待登录"),
              ]),
            ]),
            h("div", { style: { display: "flex", alignItems: "center", gap: "9px", marginTop: "12px", padding: "11px 13px", borderRadius: "12px", border: "1px solid var(--border-subtle, rgba(128, 128, 128, .14))", background: "var(--color-bg-elevated, rgba(128, 128, 128, .06))" } }, [
              h("span", { style: { width: "9px", height: "9px", flex: "0 0 auto", borderRadius: "50%", background: statusColor, boxShadow: `0 0 0 4px color-mix(in srgb, ${statusColor} 16%, transparent)` } }),
              h("span", { style: { fontSize: "13px", fontWeight: "750", overflowWrap: "anywhere" } }, data.statusText),
              h("span", { style: { marginLeft: "auto", fontSize: "11px", opacity: ".65", whiteSpace: "nowrap" } }, running ? `${data.running.length} 项运行中` : "已就绪"),
            ]),
            card([
              h("div", { style: { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "10px", marginBottom: "11px" } }, [
                h("strong", { style: { fontSize: "15px" } }, "今日任务"),
                h("span", { style: { fontSize: "11px", opacity: ".62" } }, data.dashboard.date),
              ]),
              h("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "9px" } }, data.dashboard.tasks.map(taskCard)),
              h("div", { style: { display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "13px" } }, [
                button(running ? "停止全部任务" : "补领今日未完成", () => running ? runtime.stopAll() : execute("missing"), { background: "var(--color-primary, #31cfa1)", color: "#08251d" }, false, "只执行今天尚未完成的项目"),
                button("查询 VIP", () => execute("vipStatus"), null, data.running.some((run) => run.id === "vipStatus")),
              ]),
            ], { marginTop: "12px" }),
            card([
              h("div", { style: { marginBottom: "10px" } }, [
                h("strong", { style: { fontSize: "15px" } }, "手动操作"),
                h("div", { style: { marginTop: "2px", fontSize: "12px", opacity: ".63" } }, "手动操作不会修改自动化开关；服务端会返回“今日已领取”而不是重复增加奖励。"),
              ]),
              h("div", { style: { display: "flex", flexWrap: "wrap", gap: "8px" } }, [
                button("每日奖励领取", () => execute("dailyClaim", {}, { force: true }), null, data.running.some((run) => run.id === "dailyClaim")),
                button("听歌奖励", () => execute("listenReward", { trackId: current.id || manualMixsongId.value }, { force: true }), null, data.running.some((run) => run.id === "listenReward")),
                button("广告奖励", () => execute("adReward", {}, { force: true }), null, data.running.some((run) => run.id === "adReward")),
              ]),
              h("div", { style: { marginTop: "12px", padding: "9px 10px", borderRadius: "9px", background: "var(--control-hover-bg, rgba(128, 128, 128, .08))", fontSize: "12px", opacity: ".78" } }, current.id ? `当前歌曲：${current.title || "未命名歌曲"}${current.artist ? ` · ${current.artist}` : ""}（${current.id}）` : "当前歌曲：尚未识别"),
            ], { marginTop: "12px" }),
            card([
              h("div", { style: { marginBottom: "10px" } }, [
                h("strong", { style: { fontSize: "15px" } }, "自动化设置"),
                h("div", { style: { marginTop: "2px", fontSize: "12px", opacity: ".63" } }, "启动时只补领今日未完成项目；歌曲自然结束后自动上报一次听歌奖励。"),
              ]),
              ...[
                ["autoDailyClaim", "启动时补领每日奖励", "EchoMusic 登录态就绪后，每个自然日只检查一次。"],
                ["autoAd", "启动时补领广告奖励", `最多 ${data.settings.adMaxTimes} 次，间隔 ${data.settings.adDelaySeconds} 秒；运行中可停止。`],
                ["autoListenReward", "听完歌曲自动上报", "只响应官方 onEnded 事件，同一播放会话不会重复上报。"],
              ].map(([name, title, description]) => {
                const checked = Boolean(data.settings[name]);
                return h("button", {
                  key: name,
                  type: "button",
                  role: "switch",
                  "aria-checked": checked,
                  "aria-label": title,
                  onClick: () => runtime.updateSetting(name, !checked),
                  style: {
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "14px",
                    width: "100%",
                    boxSizing: "border-box",
                    padding: "10px 11px",
                    border: "0",
                    borderTop: "1px solid var(--border-subtle, rgba(128, 128, 128, .12))",
                    borderRadius: "0",
                    background: "transparent",
                    color: "inherit",
                    textAlign: "left",
                    cursor: "pointer",
                    appearance: "none",
                    WebkitAppearance: "none",
                  },
                }, [
                  h("span", { style: { minWidth: "0", flex: "1" } }, [
                    h("span", { style: { display: "block", fontSize: "13px", fontWeight: "700" } }, title),
                    h("span", { style: { display: "block", marginTop: "2px", fontSize: "12px", opacity: ".62" } }, description),
                  ]),
                  h("span", {
                    "aria-hidden": "true",
                    style: {
                      position: "relative",
                      display: "block",
                      width: "42px",
                      height: "24px",
                      flex: "0 0 42px",
                      borderRadius: "999px",
                      background: checked ? "var(--color-primary, #31cfa1)" : "var(--control-track-bg, rgba(128, 128, 128, .28))",
                      boxShadow: checked ? "inset 0 0 0 1px rgba(0, 0, 0, .08)" : "inset 0 0 0 1px rgba(128, 128, 128, .22)",
                      transition: "background .16s ease",
                    },
                  }, [h("span", {
                    style: {
                      position: "absolute",
                      top: "3px",
                      left: checked ? "21px" : "3px",
                      width: "18px",
                      height: "18px",
                      borderRadius: "50%",
                      background: "#ffffff",
                      boxShadow: "0 1px 4px rgba(0, 0, 0, .25)",
                      transition: "left .16s ease",
                    },
                  })]),
                ]);
              }),
            ], { marginTop: "12px" }),
            h("details", { style: { marginTop: "12px", padding: "14px 15px", border: "1px solid var(--border-subtle, rgba(128, 128, 128, .16))", borderRadius: "15px", background: "var(--color-bg-elevated, rgba(128, 128, 128, .06))" } }, [
              h("summary", { style: { cursor: "pointer", fontSize: "14px", fontWeight: "800" } }, "高级设置与诊断"),
              h("div", { style: { marginTop: "13px", display: "grid", gap: "12px" } }, [
                h("label", { style: { display: "grid", gap: "6px", fontSize: "12px", fontWeight: "700" } }, [
                  "手动 MixSongID（可留空，优先使用当前歌曲）",
                  h("input", {
                    value: manualMixsongId.value,
                    placeholder: "自动读取当前歌曲；无法识别时不会自动上报",
                    onInput: (event) => { manualMixsongId.value = event.target.value; },
                    onBlur: () => {
                      manualMixsongId.value = validMixsongId(manualMixsongId.value);
                      runtime.updateSetting("manualMixsongId", manualMixsongId.value);
                    },
                    style: { boxSizing: "border-box", width: "100%", padding: "9px 10px", border: "1px solid var(--control-border, rgba(128, 128, 128, .25))", borderRadius: "9px", background: "var(--control-bg, transparent)", color: "inherit", fontSize: "13px" },
                  }),
                ]),
                h("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "10px" } }, [
                  ["广告次数", adMaxTimes, "adMaxTimes", 1, 8, 8],
                  ["广告间隔（秒）", adDelaySeconds, "adDelaySeconds", 5, 120, 30],
                  ["请求超时（秒）", requestTimeoutSeconds, "requestTimeoutSeconds", 5, 120, 20],
                ].map(([label, refValue, name, min, max, fallback]) => h("label", { key: name, style: { display: "grid", gap: "6px", fontSize: "12px", fontWeight: "700" } }, [
                  label,
                  h("input", {
                    type: "number",
                    min: String(min),
                    max: String(max),
                    value: refValue.value,
                    onInput: (event) => { refValue.value = event.target.value; },
                    onBlur: () => updateNumber(name, refValue, min, max, fallback),
                    style: { boxSizing: "border-box", width: "100%", padding: "9px 10px", border: "1px solid var(--control-border, rgba(128, 128, 128, .25))", borderRadius: "9px", background: "var(--control-bg, transparent)", color: "inherit", fontSize: "13px" },
                  }),
                ]))),
                h("div", { style: { padding: "10px", borderRadius: "9px", background: "var(--control-hover-bg, rgba(128, 128, 128, .08))", fontSize: "12px", lineHeight: "1.65" } }, `诊断：插件 ${PLUGIN_VERSION} · schema ${data.schemaVersion} · ${data.hostSupported ? "官方播放器事件正常" : "宿主事件不可用"} · ${data.auth.message}`),
              ]),
            ]),
            h("details", { style: { marginTop: "12px" } }, [
              h("summary", { style: { cursor: "pointer", fontSize: "13px", fontWeight: "800", opacity: ".78" } }, `运行日志（最近 ${data.logs.length} 条）`),
              h("pre", { style: { boxSizing: "border-box", maxHeight: "260px", margin: "10px 0 0", padding: "11px 12px", overflowY: "auto", whiteSpace: "pre-wrap", overflowWrap: "anywhere", borderRadius: "10px", background: "#101a18", color: "#d9f7e9", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", fontSize: "11px", lineHeight: "1.65" } }, logs || "暂无日志"),
            ]),
          ]);
        };
      },
    });
    this.ctx.ui.settings.define({
      id: "default",
      title: "酷狗奖励",
      description: "每日奖励看板：启动补领、听歌上报、广告奖励",
      component,
    });
  }

  subscribe(listener) {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  setStatus(text) {
    this.statusText = text;
    this.emit?.();
  }

  notify(type, message) {
    try {
      const toast = this.ctx.toast?.[type] || this.ctx.toast?.info;
      if (typeof toast === "function") toast(message);
    } catch { /* 旧版宿主可能没有 toast */ }
  }

  async log(level, message, task = "") {
    if (!this.state) return;
    this.state.logs.push({ at: Date.now(), level, message: String(message), task });
    while (this.state.logs.length > MAX_LOGS) this.state.logs.shift();
    this.emit?.();
    await this.saveState();
  }

  saveState() {
    if (!this.state || !this.ctx.storage?.set) return Promise.resolve();
    const payload = serializeState(this.state);
    this.saveChain = this.saveChain
      .catch(() => {})
      .then(() => this.ctx.storage.set(STORAGE_KEY, payload));
    return this.saveChain;
  }

  snapshot() {
    const current = this.host?.getSnapshot?.() || { track: normalizeTrackSnapshot(null), supported: false };
    const dashboard = this.state ? deriveDashboard(this.state) : { completed: 0, total: 0, tasks: [] };
    return {
      schemaVersion: this.state?.schemaVersion || 2,
      statusText: this.statusText,
      settings: { ...(this.state?.settings || {}) },
      dashboard,
      currentTrack: current.track,
      hostSupported: Boolean(this.host?.supported),
      auth: { ...this.authState },
      running: this.engine?.currentRuns?.() || [],
      logs: this.state?.logs?.slice(-MAX_LOGS) || [],
      diagnostics: { ...(this.state?.diagnostics || {}) },
    };
  }

  async dispose() {
    if (this.disposed) return;
    this.disposed = true;
    activeInstances.delete(this);
    clearTimeout(this.startupTimer);
    this.engine?.cancelAll?.();
    this.host?.dispose?.();
    await this.saveState();
    this.listeners.clear();
  }
}

export async function activate(ctx) {
  const instance = new PluginRuntime(ctx);
  activeInstances.add(instance);
  await instance.start();
  return instance;
}

export async function deactivate() {
  await Promise.all(Array.from(activeInstances).map((instance) => instance.dispose()));
  activeInstances.clear();
}

export {
  deriveDashboard,
  migrateState,
  normalizeApiOutcome,
  normalizeTrackSnapshot,
  taskIsDone,
  trackEventKey,
};

export default activate;
