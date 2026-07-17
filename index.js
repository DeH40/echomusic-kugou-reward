const APP_ID = 3116;
const CLIENT_VERSION = 11436;
const LISTEN_CLIENT_VERSION = 10566;
const SIGN_SECRET = "LnT6xpN3khm36zse0QzvmgTZ3waWdRSA";
const GATEWAY_URL = "https://gateway.kugou.com";
const VIP_URL = "https://kugouvip.kugou.com";
const SOURCE_ID = 90137;
const DEFAULT_MIXSONG_ID = "666075191";
const AD_ID = 12307537187;
const AD_PLAY_MS = 30000;
const DEFAULT_AD_MAX_TIMES = 8;
const DEFAULT_AD_DELAY_SECONDS = 30;
const LISTEN_ALREADY_CODE = 130012;
const AD_EXHAUSTED_CODE = 30002;
const STORAGE_KEY = "echomusicState";
const MAX_LOGS = 40;
const MAX_REQUEST_ATTEMPTS = 3;
const PLAYBACK_POLL_MS = 1500;
const AUTO_TASK_DELAY_MS = 1200;
const DEFAULT_USER_AGENT = "Android15-1070-11083-46-0-DiscoveryDRADProtocol-wifi";
const LISTEN_USER_AGENT = "Android13-1070-10566-201-0-ReportPlaySongToServerProtocol-wifi";

function todayKey() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
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

function getPiniaState() {
  try {
    if (typeof document === "undefined") return {};
    const app = document.querySelector?.("#app");
    return app?.__vue_app__?.config?.globalProperties?.$pinia?.state?.value || {};
  } catch {
    return {};
  }
}

function firstObject(candidates) {
  return candidates.find((candidate) => candidate && typeof candidate === "object") || {};
}

function getAuth() {
  const state = getPiniaState();
  const userStore = state.user || state.userStore || {};
  const info = firstObject([userStore.info, userStore.userInfo, userStore.account, userStore]);
  const deviceStore = state.device || state.deviceStore || {};
  const device = firstObject([deviceStore.info, deviceStore.device, deviceStore]);
  const token = info.token || info.kgToken || info.kg_token || "";
  const userid = info.userid || info.userId || info.uid || 0;
  const dfid = device.dfid || device.dfidValue || "-";

  if (!token || !userid) throw new Error("没有读取到 EchoMusic 当前酷狗登录态，请先登录后再试");
  return { token: String(token), userid: String(userid), dfid: String(dfid || "-") };
}

function validMixsongId(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? String(Math.trunc(numeric)) : "";
}

function findMixsongId(value, depth = 0, visited = []) {
  if (!value || typeof value !== "object" || depth > 4 || visited.length > 120) return "";
  if (visited.includes(value)) return "";
  visited.push(value);

  for (const key of ["mixsongid", "mixSongId", "mix_song_id", "MixSongID", "album_audio_id", "albumAudioId"]) {
    const result = validMixsongId(value[key]);
    if (result) return result;
  }

  const preferred = ["currentSong", "currentTrack", "playingSong", "playingTrack", "current", "song", "track", "music"];
  for (const key of preferred) {
    const result = findMixsongId(value[key], depth + 1, visited);
    if (result) return result;
  }
  for (const key of Object.keys(value)) {
    if (preferred.includes(key)) continue;
    const result = findMixsongId(value[key], depth + 1, visited);
    if (result) return result;
  }
  return "";
}

function currentMixsongId() {
  const state = getPiniaState();
  return findMixsongId(state.player || state.playback || state.music || state);
}

function responseMessage(payload) {
  const message = payload?.msg || payload?.message || payload?.error_msg || payload?.data?.msg;
  if (message) return String(message);
  const code = payload?.error_code ?? payload?.status;
  return code === undefined ? "接口已返回结果" : `接口返回状态码 ${code}`;
}

function isFailedResponse(payload) {
  return String(payload?.status) === "0" ||
    (payload?.error_code !== undefined && String(payload.error_code) !== "0");
}

function findValue(value, keys, depth = 0, visited = []) {
  if (!value || typeof value !== "object" || depth > 5 || visited.length > 160) return undefined;
  if (visited.includes(value)) return undefined;
  visited.push(value);
  for (const key of keys) {
    if (value[key] !== undefined && value[key] !== null && value[key] !== "") return value[key];
  }
  for (const key of Object.keys(value)) {
    const found = findValue(value[key], keys, depth + 1, visited);
    if (found !== undefined) return found;
  }
  return undefined;
}

function formatExpire(value) {
  if (value === undefined || value === null || value === "") return "未返回到期时间";
  const numeric = Number(value);
  const date = Number.isFinite(numeric)
    ? new Date(numeric < 100000000000 ? numeric * 1000 : numeric)
    : new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function resultSummary(label, payload) {
  const status = payload?.status === undefined ? "未知" : String(payload.status);
  return `${label}：status=${status}，${responseMessage(payload)}`;
}

function clampInt(value, fallback, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(numeric)));
}

function sleep(milliseconds, signal) {
  if (signal?.aborted) return Promise.resolve(false);
  if (!signal) return new Promise((resolve) => setTimeout(() => resolve(true), milliseconds));

  return new Promise((resolve) => {
    let timer;
    const finish = (completed) => {
      clearTimeout(timer);
      signal.removeEventListener?.("abort", onAbort);
      resolve(completed);
    };
    const onAbort = () => finish(false);
    timer = setTimeout(() => finish(true), milliseconds);
    signal.addEventListener?.("abort", onAbort, { once: true });
  });
}

function nonRetryableError(message) {
  const error = new Error(message);
  error.retryable = false;
  return error;
}

function cancelledError(message = "任务已停止") {
  const error = nonRetryableError(message);
  error.cancelled = true;
  return error;
}

function normaliseSeconds(value, key = "") {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return 0;
  return key.toLowerCase().includes("ms") || numeric > 10000 ? numeric / 1000 : numeric;
}

function findEntry(value, keys, depth = 0, visited = []) {
  if (!value || typeof value !== "object" || depth > 5 || visited.length > 160) return undefined;
  if (visited.includes(value)) return undefined;
  visited.push(value);

  for (const key of keys) {
    if (value[key] !== undefined && value[key] !== null && value[key] !== "") {
      return { key, value: value[key] };
    }
  }
  for (const key of Object.keys(value)) {
    const found = findEntry(value[key], keys, depth + 1, visited);
    if (found) return found;
  }
  return undefined;
}

function booleanValue(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value !== "string") return undefined;
  if (["true", "1", "playing", "play", "started"].includes(value.toLowerCase())) return true;
  if (["false", "0", "paused", "pause", "stopped", "ended"].includes(value.toLowerCase())) return false;
  return undefined;
}

function playbackSnapshot() {
  const state = getPiniaState();
  const player = firstObject([
    state.player,
    state.playback,
    state.playerStore,
    state.playbackStore,
    state.musicPlayer,
    state.audio,
    state.music,
    state,
  ]);
  if (!player || typeof player !== "object") return null;

  const durationEntry = findEntry(player, [
    "durationMs", "duration_ms", "totalDurationMs", "total_duration_ms", "duration", "totalDuration", "songDuration",
  ]);
  const positionEntry = findEntry(player, [
    "currentTimeMs", "current_time_ms", "positionMs", "position_ms", "playedTimeMs", "played_time_ms",
    "currentTime", "currentPosition", "position", "playedTime", "progressTime", "playTime",
  ]);
  const playingEntry = findEntry(player, ["isPlaying", "is_playing", "playing", "isPlay", "playState", "playStatus"]);
  const endedEntry = findEntry(player, ["ended", "isEnded", "is_ended", "playEnded"]);
  const trackId = currentMixsongId();
  const duration = durationEntry ? normaliseSeconds(durationEntry.value, durationEntry.key) : 0;
  const position = positionEntry ? normaliseSeconds(positionEntry.value, positionEntry.key) : 0;
  const playing = playingEntry ? booleanValue(playingEntry.value) : undefined;
  const ended = endedEntry ? booleanValue(endedEntry.value) : undefined;

  if (!trackId && !duration && !position && playing === undefined && ended === undefined) return null;
  return { trackId, duration, position, playing, ended };
}

function playbackReachedEnd(previous, current) {
  if (!previous || !current) return false;
  if (previous.ended === true || current.ended === true) return true;
  const duration = current.duration || previous.duration;
  const position = Math.max(current.position || 0, previous.position || 0);
  if (duration > 0 && position >= Math.max(duration - 3, duration * 0.9)) return true;
  return previous.playing === true && current.playing === false && duration > 0 && position >= duration * 0.75;
}

export default async function (ctx) {
  const { defineComponent, h, ref, onUnmounted } = ctx.vue;
  const stored = (await ctx.storage.get(STORAGE_KEY)) || {};
  const settings = {
    autoOpenCheckin: stored.autoOpenCheckin ?? stored.autoCheckin !== false,
    autoOpenAd: stored.autoOpenAd ?? stored.autoAd !== false,
    autoListenReward: stored.autoListenReward !== false,
    mixsongId: stored.mixsongId || "",
    adMaxTimes: clampInt(stored.adMaxTimes, DEFAULT_AD_MAX_TIMES, 1, 8),
    adDelaySeconds: clampInt(stored.adDelaySeconds, DEFAULT_AD_DELAY_SECONDS, 5, 120),
  };
  const logs = Array.isArray(stored.logs) ? stored.logs.slice(-MAX_LOGS) : [];
  let lastCheckinDate = stored.lastCheckinDate || "";
  let running = false;
  let adRunning = false;
  let adStopRequested = false;
  let adController = null;
  let adRunToken = 0;
  let autoListenHandled = false;
  let pendingListenRewardId = "";
  let autoListenQueued = false;
  let lastAutoListenEventKey = "";
  let lastAutoListenEventAt = 0;
  let statusText = "就绪";
  let logVersion = 0;
  const statusListeners = new Set();

  const setStatus = (text) => {
    statusText = text;
    for (const listener of statusListeners) listener(text);
  };

  const bumpLogs = () => {
    logVersion += 1;
    for (const listener of statusListeners) listener(statusText);
  };

  const saveState = async () => {
    await ctx.storage.set(STORAGE_KEY, {
      autoOpenCheckin: settings.autoOpenCheckin,
      autoOpenAd: settings.autoOpenAd,
      autoListenReward: settings.autoListenReward,
      // 保留旧字段，便于 0.3.x 升级后继续识别已有配置。
      autoCheckin: settings.autoOpenCheckin,
      autoAd: settings.autoOpenAd,
      mixsongId: settings.mixsongId,
      adMaxTimes: settings.adMaxTimes,
      adDelaySeconds: settings.adDelaySeconds,
      lastCheckinDate,
      logs: logs.slice(-MAX_LOGS),
    });
  };

  const addLog = async (message) => {
    logs.push(`[${new Date().toLocaleTimeString()}] ${message}`);
    while (logs.length > MAX_LOGS) logs.shift();
    await saveState();
    bumpLogs();
  };

  const notify = (type, message) => {
    try {
      const toast = ctx.toast?.[type] || ctx.toast?.info;
      if (typeof toast === "function") toast(message);
    } catch {
      // Older EchoMusic builds may not expose toast helpers.
    }
  };

  const request = async ({
    baseUrl = GATEWAY_URL,
    path,
    method = "GET",
    params = {},
    data,
    headers = {},
    acceptedErrorCodes = [],
    signal,
  }) => {
    const auth = getAuth();
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
    let lastError;

    for (let attempt = 1; attempt <= MAX_REQUEST_ATTEMPTS; attempt += 1) {
      try {
        const response = await ctx.net.fetch(url, {
          method,
          headers: {
            Accept: "application/json",
            "User-Agent": DEFAULT_USER_AGENT,
            dfid,
            mid,
            clienttime: String(allParams.clienttime),
            ...headers,
          },
          ...(signal ? { signal } : {}),
          ...(data === undefined ? {} : { body }),
        });

        let payload;
        try {
          payload = await response.json();
        } catch {
          const error = new Error(`酷狗接口返回了无法解析的响应（HTTP ${response?.status || "?"}）`);
          error.retryable = response?.status >= 500;
          throw error;
        }
        if (response?.ok === false || (response?.status && response.status >= 400)) {
          const error = new Error(`酷狗接口 HTTP ${response.status}`);
          error.retryable = response.status >= 500;
          throw error;
        }

        const errorCode = Number(payload?.error_code);
        if (acceptedErrorCodes.includes(errorCode)) return payload;
        if (isFailedResponse(payload)) throw nonRetryableError(responseMessage(payload));
        return payload;
      } catch (error) {
        if (signal?.aborted) throw cancelledError("广告签到已停止");
        lastError = error;
        if (error?.retryable === false || attempt === MAX_REQUEST_ATTEMPTS) throw error;
        const waitSeconds = attempt;
        await addLog(`网络请求失败，${waitSeconds} 秒后重试（${attempt}/${MAX_REQUEST_ATTEMPTS}）：${error?.message || error}`);
        await sleep(waitSeconds * 1000);
      }
    }
    throw lastError || new Error("酷狗接口请求失败");
  };

  const resolveMixsongId = (configuredMixsongId) => {
    return validMixsongId(configuredMixsongId)
      || validMixsongId(settings.mixsongId)
      || currentMixsongId()
      || DEFAULT_MIXSONG_ID;
  };

  /** 听歌回执领取概念 VIP（对应 kgcheckin /youth/listen/song） */
  const listenReward = async (configuredMixsongId) => {
    const mixsongid = resolveMixsongId(configuredMixsongId);
    settings.mixsongId = mixsongid;
    setStatus(`正在听歌回执（${mixsongid}）…`);

    const report = await request({
      path: "/youth/v2/report/listen_song",
      method: "POST",
      params: { clientver: LISTEN_CLIENT_VERSION },
      data: { mixsongid: Number(mixsongid) },
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "User-Agent": LISTEN_USER_AGENT,
      },
      acceptedErrorCodes: [LISTEN_ALREADY_CODE],
    });
    if (Number(report?.error_code) === LISTEN_ALREADY_CODE) {
      await addLog(`听歌回执（${mixsongid}）：今日已领取`);
    } else {
      await addLog(resultSummary(`听歌回执（${mixsongid}）`, report));
    }

    // 兼容旧版「听歌后领取」接口，失败不阻断主流程
    try {
      const claim = await request({
        path: "/youth/v1/recharge/receive_vip_listen_song",
        method: "POST",
        params: { source_id: SOURCE_ID },
        acceptedErrorCodes: [LISTEN_ALREADY_CODE, AD_EXHAUSTED_CODE],
      });
      if (Number(claim?.error_code) === LISTEN_ALREADY_CODE) {
        await addLog("听歌奖励领取：今日已领取");
      } else {
        await addLog(resultSummary("听歌奖励领取", claim));
      }
    } catch (error) {
      await addLog(`听歌奖励领取跳过：${error?.message || error}`);
    }

    notify("success", "听歌领取流程已完成");
  };

  /** 仅调用领取一天 VIP 接口（对应 youth_day_vip） */
  const checkIn = async () => {
    setStatus("正在签到领取…");
    const payload = await request({
      path: "/youth/v1/recharge/receive_vip_listen_song",
      method: "POST",
      params: { source_id: SOURCE_ID },
      acceptedErrorCodes: [LISTEN_ALREADY_CODE],
    });
    if (Number(payload?.error_code) === LISTEN_ALREADY_CODE) {
      await addLog("签到领取：今日已领取");
    } else {
      await addLog(resultSummary("签到领取", payload));
    }
    notify("success", "酷狗签到领取请求已完成");
  };

  /**
   * 广告播放自动上报领取 VIP（对应 kgcheckin /youth/vip → /youth/v1/ad/play_report）
   * 每天最多 8 次，成功后间隔等待再领下一次；error_code 30002 表示今日次数用尽。
   */
  const adReward = async () => {
    if (adRunning) {
      notify("info", "广告签到已经在执行中");
      return { claimCount: 0, claimTotal: 0, stopped: false };
    }

    const maxTimes = clampInt(settings.adMaxTimes, DEFAULT_AD_MAX_TIMES, 1, 8);
    const delaySeconds = clampInt(settings.adDelaySeconds, DEFAULT_AD_DELAY_SECONDS, 5, 120);
    const runToken = ++adRunToken;
    adStopRequested = false;
    adController = typeof AbortController === "function" ? new AbortController() : null;
    adRunning = true;
    let claimCount = 0;
    let claimTotal = 0;
    let stopped = false;

    try {
      await addLog(`开始广告播放上报，最多 ${maxTimes} 次，间隔 ${delaySeconds} 秒`);

      for (let index = 1; index <= maxTimes; index += 1) {
        if (adStopRequested || runToken !== adRunToken) {
          stopped = true;
          await addLog("广告签到已停止，不再提交下一次广告上报");
          break;
        }

        claimTotal = index;
        setStatus(`正在广告领取（${index}/${maxTimes}）…`);
        const now = Date.now();
        let payload;
        try {
          payload = await request({
            path: "/youth/v1/ad/play_report",
            method: "POST",
            data: {
              ad_id: AD_ID,
              play_end: now,
              play_start: now - AD_PLAY_MS,
            },
            headers: {
              "Content-Type": "application/json; charset=utf-8",
            },
            acceptedErrorCodes: [AD_EXHAUSTED_CODE],
            signal: adController?.signal,
          });
        } catch (error) {
          if (error?.cancelled || adStopRequested || runToken !== adRunToken) {
            stopped = true;
            await addLog("广告签到已停止，当前请求未继续重试");
            break;
          }
          throw error;
        }

        if (Number(payload?.error_code) === AD_EXHAUSTED_CODE) {
          await addLog(`第 ${index} 次广告领取：今天次数已用光`);
          break;
        }

        claimCount += 1;
        await addLog(resultSummary(`第 ${index} 次广告领取成功`, payload));

        if (index < maxTimes) {
          if (adStopRequested || runToken !== adRunToken) {
            stopped = true;
            await addLog("广告签到已停止，不再等待下一次上报");
            break;
          }
          setStatus(`广告领取成功，等待 ${delaySeconds} 秒后继续（${index}/${maxTimes}）…`);
          await addLog(`等待 ${delaySeconds} 秒后进行下一次广告上报…`);
          const completed = await sleep(delaySeconds * 1000, adController?.signal);
          if (!completed || adStopRequested || runToken !== adRunToken) {
            stopped = true;
            await addLog("广告签到已停止，不再提交下一次广告上报");
            break;
          }
        }
      }

      await addLog(`广告领取${stopped ? "已停止" : "完成"}：成功 ${claimCount}/${claimTotal} 次`);
      notify(stopped ? "info" : "success", `广告领取${stopped ? "已停止" : "完成"}：${claimCount}/${claimTotal}`);
      return { claimCount, claimTotal, stopped };
    } finally {
      adRunning = false;
      adStopRequested = false;
      adController = null;
    }
  };

  const stopAdReward = () => {
    if (!adRunning) {
      notify("info", "当前没有正在执行的广告签到");
      return false;
    }
    adStopRequested = true;
    adRunToken += 1;
    adController?.abort?.();
    setStatus("正在停止广告签到…");
    void addLog("收到停止广告签到请求");
    return true;
  };

  const queryVip = async () => {
    setStatus("正在查询 VIP…");
    const payload = await request({
      baseUrl: VIP_URL,
      path: "/v1/get_union_vip",
      params: { busi_type: "concept" },
    });
    const expire = payload?.data?.busi_vip?.[0]?.vip_end_time ??
      findValue(payload, ["vip_end_time", "end_time", "expire_time", "vipEndTime"]);
    const formatted = formatExpire(expire);
    await addLog(`VIP 状态：${formatted}；${responseMessage(payload)}`);
    notify("success", `VIP 状态查询完成：${formatted}`);
    return formatted;
  };

  let drainPendingListenReward = () => {};

  /** 打开 EchoMusic 后执行的轻量自动流程：签到领取 + 广告签到。 */
  const openTasks = async () => {
    await addLog("======== 开始打开时自动任务 ========");
    let completed = 0;

    if (settings.autoOpenCheckin) {
      try {
        await checkIn();
        completed += 1;
      } catch (error) {
        await addLog(`打开时自动签到失败：${error?.message || error}`);
      }
    } else {
      await addLog("已关闭打开时自动签到，跳过签到领取");
    }

    if (settings.autoOpenAd) {
      try {
        const result = await adReward();
        if (!result?.stopped) completed += 1;
      } catch (error) {
        await addLog(`打开时自动广告签到失败：${error?.message || error}`);
      }
    } else {
      await addLog("已关闭打开时自动广告签到，跳过广告上报");
    }

    await addLog(`打开时自动任务结束：完成 ${completed}/2 项`);
    notify("success", `打开时自动任务完成：${completed}/2 项`);
  };

  /**
   * 对齐 kgcheckin main.js 的每日流程：
   * 1) 听歌领取  2) 广告上报最多 8 次  3) 查询 VIP
   */
  const dailyAll = async (configuredMixsongId) => {
    await addLog("======== 开始每日 VIP 任务 ========");
    setStatus("每日任务：听歌领取…");
    await listenReward(configuredMixsongId);

    if (settings.autoOpenAd) {
      setStatus("每日任务：广告领取…");
      await adReward();
    } else {
      await addLog("已关闭广告自动领取，跳过广告上报");
    }

    setStatus("每日任务：查询 VIP…");
    await queryVip();

    lastCheckinDate = todayKey();
    await saveState();
    await addLog("======== 每日 VIP 任务结束 ========");
    notify("success", "每日 VIP 任务已完成");
  };

  const run = async (task, argument) => {
    if (running) {
      notify("info", "已有任务正在执行");
      return false;
    }
    running = true;
    let succeeded = false;
    try {
      if (task === "daily") await dailyAll(argument);
      else if (task === "open") await openTasks();
      else if (task === "checkin") await checkIn();
      else if (task === "listen") await listenReward(argument);
      else if (task === "ad") await adReward();
      else if (task === "vip") await queryVip();
      succeeded = true;
    } catch (error) {
      const message = error?.message || String(error);
      await addLog(`失败：${message}`);
      if (!error?.cancelled) notify("danger", message);
    } finally {
      running = false;
      setStatus("就绪");
      setTimeout(() => drainPendingListenReward(), 0);
    }
    return succeeded;
  };

  const queueAutoListenReward = (mixsongId, source = "播放完成") => {
    if (!settings.autoListenReward || autoListenHandled) return;

    const resolvedId = validMixsongId(mixsongId)
      || currentMixsongId()
      || validMixsongId(settings.mixsongId)
      || DEFAULT_MIXSONG_ID;
    const now = Date.now();
    const eventKey = `${resolvedId}:${source}`;
    if (eventKey === lastAutoListenEventKey && now - lastAutoListenEventAt < 5000) return;
    lastAutoListenEventKey = eventKey;
    lastAutoListenEventAt = now;
    pendingListenRewardId = resolvedId;
    setStatus("已听完一首歌，准备领取听歌奖励…");
    void addLog(`检测到${source}，已排队自动领取听歌奖励（${resolvedId}）`);
    drainPendingListenReward();
  };

  drainPendingListenReward = () => {
    if (!settings.autoListenReward || autoListenHandled || autoListenQueued || running || !pendingListenRewardId) return;

    const mixsongId = pendingListenRewardId;
    pendingListenRewardId = "";
    autoListenQueued = true;
    void run("listen", mixsongId).then((succeeded) => {
      autoListenQueued = false;
      if (succeeded) {
        autoListenHandled = true;
        void addLog("本次自动听歌奖励已完成，当前打开周期不再重复触发");
      }
      drainPendingListenReward();
    });
  };

  let playbackWatcherStarted = false;

  const startPlaybackWatcher = () => {
    if (playbackWatcherStarted || typeof document === "undefined") return;
    playbackWatcherStarted = true;

    const attachedAudios = new WeakSet();
    const audioStates = new WeakMap();
    let previousSnapshot = null;

    const attachAudio = (audio) => {
      if (!audio || typeof audio.addEventListener !== "function" || attachedAudios.has(audio)) return;
      attachedAudios.add(audio);
      const state = { mixsongId: "" };
      audioStates.set(audio, state);

      const onPlay = () => {
        state.mixsongId = currentMixsongId();
      };
      const onEnded = () => {
        queueAutoListenReward(state.mixsongId || currentMixsongId(), "歌曲播放完成");
      };
      audio.addEventListener("play", onPlay);
      audio.addEventListener("ended", onEnded);
    };

    const scanAudios = () => {
      try {
        document.querySelectorAll?.("audio").forEach(attachAudio);
      } catch {
        // 某些旧版 WebView 在页面切换时可能短暂无法查询 DOM。
      }
    };

    scanAudios();
    let observer;
    try {
      if (typeof MutationObserver === "function" && document.documentElement) {
        observer = new MutationObserver(scanAudios);
        observer.observe(document.documentElement, { childList: true, subtree: true });
      }
    } catch {
      observer = undefined;
    }

    const pollTimer = setInterval(() => {
      scanAudios();
      const currentSnapshot = playbackSnapshot();
      if (!currentSnapshot) return;

      if (previousSnapshot) {
        const switchedSong = Boolean(
          previousSnapshot.trackId && currentSnapshot.trackId && previousSnapshot.trackId !== currentSnapshot.trackId,
        );
        const endedNow = currentSnapshot.ended === true && previousSnapshot.ended !== true;
        const stoppedAtEnd = Boolean(
          previousSnapshot.trackId && currentSnapshot.trackId &&
          previousSnapshot.trackId === currentSnapshot.trackId &&
          previousSnapshot.playing === true && currentSnapshot.playing === false &&
          playbackReachedEnd(previousSnapshot, currentSnapshot),
        );

        if ((switchedSong && playbackReachedEnd(previousSnapshot, currentSnapshot)) || endedNow || stoppedAtEnd) {
          queueAutoListenReward(previousSnapshot.trackId || currentSnapshot.trackId, "播放器状态完成");
        }
      }
      previousSnapshot = currentSnapshot;
    }, PLAYBACK_POLL_MS);

    // 插件宿主没有统一的卸载钩子；定时器保持与插件实例同生命周期，避免关闭设置面板后丢失自动触发。
    void observer;
    void audioStates;
    void pollTimer;
  };

  const component = defineComponent({
    name: "EchoMusicKugouReward",
    setup() {
      const status = ref(statusText);
      const mixsongId = ref(settings.mixsongId);
      const autoOpenCheckin = ref(settings.autoOpenCheckin);
      const autoOpenAd = ref(settings.autoOpenAd);
      const autoListenReward = ref(settings.autoListenReward);
      const adMaxTimes = ref(String(settings.adMaxTimes));
      const adDelaySeconds = ref(String(settings.adDelaySeconds));
      const logTick = ref(logVersion);

      const onStatus = () => {
        status.value = statusText;
        logTick.value = logVersion;
      };
      statusListeners.add(onStatus);
      if (typeof onUnmounted === "function") {
        onUnmounted(() => statusListeners.delete(onStatus));
      }

      const execute = async (task) => {
        await run(task, mixsongId.value);
        status.value = statusText;
        logTick.value = logVersion;
      };

      const updateMixsongId = async (event) => {
        mixsongId.value = event?.target?.value || "";
        settings.mixsongId = mixsongId.value;
        await saveState();
      };

      const updateAutoOpenCheckin = async (event) => {
        autoOpenCheckin.value = Boolean(event?.target?.checked);
        settings.autoOpenCheckin = autoOpenCheckin.value;
        await saveState();
      };

      const updateAutoOpenAd = async (event) => {
        autoOpenAd.value = Boolean(event?.target?.checked);
        settings.autoOpenAd = autoOpenAd.value;
        await saveState();
      };

      const updateAutoListenReward = async (event) => {
        autoListenReward.value = Boolean(event?.target?.checked);
        settings.autoListenReward = autoListenReward.value;
        await saveState();
      };

      const updateAdMaxTimes = async (event) => {
        adMaxTimes.value = event?.target?.value || String(DEFAULT_AD_MAX_TIMES);
        settings.adMaxTimes = clampInt(adMaxTimes.value, DEFAULT_AD_MAX_TIMES, 1, 8);
        adMaxTimes.value = String(settings.adMaxTimes);
        await saveState();
      };

      const updateAdDelaySeconds = async (event) => {
        adDelaySeconds.value = event?.target?.value || String(DEFAULT_AD_DELAY_SECONDS);
        settings.adDelaySeconds = clampInt(adDelaySeconds.value, DEFAULT_AD_DELAY_SECONDS, 5, 120);
        adDelaySeconds.value = String(settings.adDelaySeconds);
        await saveState();
      };

      const buttonStyle = {
        minHeight: "38px",
        padding: "8px 14px",
        border: "0",
        borderRadius: "10px",
        background: "#2563eb",
        color: "#ffffff",
        fontSize: "13px",
        fontWeight: "600",
        cursor: "pointer",
        boxShadow: "0 4px 12px rgba(37, 99, 235, 0.22)",
        transition: "opacity 160ms ease, transform 160ms ease",
      };

      const secondaryButtonStyle = {
        ...buttonStyle,
        background: "#0f766e",
        boxShadow: "0 4px 12px rgba(15, 118, 110, 0.2)",
      };

      const quietButtonStyle = {
        ...buttonStyle,
        background: "rgba(107, 114, 128, 0.16)",
        color: "inherit",
        boxShadow: "none",
      };

      const dangerButtonStyle = {
        ...buttonStyle,
        background: "#b42318",
        boxShadow: "0 4px 12px rgba(180, 35, 24, 0.2)",
      };

      const inputStyle = {
        width: "100%",
        boxSizing: "border-box",
        padding: "10px 12px",
        border: "1px solid rgba(148, 163, 184, 0.55)",
        borderRadius: "9px",
        background: "rgba(255, 255, 255, 0.72)",
        color: "#111827",
        fontSize: "14px",
        outline: "none",
      };

      const smallInputStyle = {
        ...inputStyle,
        width: "84px",
        padding: "8px 9px",
      };

      const cardStyle = {
        padding: "14px",
        border: "1px solid rgba(148, 163, 184, 0.25)",
        borderRadius: "14px",
        background: "rgba(148, 163, 184, 0.08)",
      };

      const toggleCard = (title, description, checked, onChange, accent) => h("label", {
        style: {
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "14px",
          padding: "12px 13px",
          border: "1px solid rgba(148, 163, 184, 0.22)",
          borderRadius: "11px",
          background: "rgba(255, 255, 255, 0.08)",
          cursor: "pointer",
        },
      }, [
        h("span", { style: { minWidth: "0", display: "block" } }, [
          h("span", { style: { display: "block", fontSize: "13px", fontWeight: "700" } }, title),
          h("span", { style: { display: "block", marginTop: "2px", fontSize: "12px", opacity: "0.66", lineHeight: "1.45" } }, description),
        ]),
        h("input", {
          type: "checkbox",
          checked,
          onChange,
          "aria-label": title,
          style: { width: "19px", height: "19px", flex: "0 0 auto", accentColor: accent, cursor: "pointer" },
        }),
      ]);

      const actionButton = (label, task, style = buttonStyle) => h("button", {
        type: "button",
        onClick: () => execute(task),
        disabled: running,
        style: { ...style, opacity: running ? "0.52" : "1", cursor: running ? "not-allowed" : "pointer" },
      }, label);

      const stopButton = () => h("button", {
        type: "button",
        onClick: stopAdReward,
        disabled: !adRunning,
        style: {
          ...dangerButtonStyle,
          opacity: adRunning ? "1" : "0.42",
          cursor: adRunning ? "pointer" : "not-allowed",
        },
        title: "立即停止当前广告签到循环",
      }, adRunning ? "停止广告" : "停止广告（未运行）");

      const sectionTitle = (title, description) => h("div", { style: { marginBottom: "10px" } }, [
        h("div", { style: { fontSize: "14px", fontWeight: "800" } }, title),
        description ? h("div", { style: { marginTop: "2px", fontSize: "12px", opacity: "0.62" } }, description) : null,
      ]);

      const statusTone = () => {
        if (adRunning) return { color: "#d97706", background: "rgba(245, 158, 11, 0.12)" };
        if (running) return { color: "#2563eb", background: "rgba(37, 99, 235, 0.12)" };
        return { color: "#15803d", background: "rgba(34, 197, 94, 0.12)" };
      };

      return () => h("div", {
        style: {
          maxWidth: "720px",
          margin: "0 auto",
          padding: "18px",
          color: "inherit",
          lineHeight: "1.55",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        },
      }, [
        h("div", { style: { ...cardStyle, padding: "17px", background: "linear-gradient(135deg, rgba(37, 99, 235, 0.14), rgba(15, 118, 110, 0.08))" } }, [
          h("div", { style: { display: "flex", alignItems: "flex-start", gap: "12px" } }, [
            h("div", { style: { width: "42px", height: "42px", display: "grid", placeItems: "center", flex: "0 0 auto", borderRadius: "13px", background: "#2563eb", color: "#ffffff", fontSize: "24px", fontWeight: "800", boxShadow: "0 8px 18px rgba(37, 99, 235, 0.25)" } }, "♫"),
            h("div", { style: { minWidth: "0", flex: "1" } }, [
              h("div", { style: { fontSize: "10px", letterSpacing: "0.12em", fontWeight: "800", opacity: "0.58" } }, "ECHOMUSIC · REWARD"),
              h("h2", { style: { margin: "3px 0 3px", fontSize: "21px", lineHeight: "1.2", fontWeight: "800" } }, "酷狗奖励助手"),
              h("p", { style: { margin: "0", fontSize: "12px", opacity: "0.72" } }, "打开自动签到与广告，听完一首歌自动领取听歌奖励"),
            ]),
            h("span", { style: { flex: "0 0 auto", padding: "4px 8px", borderRadius: "999px", background: "rgba(255, 255, 255, 0.55)", fontSize: "11px", fontWeight: "800" } }, (settings.autoOpenCheckin || settings.autoOpenAd || settings.autoListenReward) ? "自动运行" : "手动模式"),
          ]),
          h("div", { style: { display: "flex", flexWrap: "wrap", gap: "7px", marginTop: "15px" } }, [
            h("span", { style: { padding: "5px 9px", borderRadius: "8px", background: "rgba(255, 255, 255, 0.48)", fontSize: "12px" } }, "打开：签到 + 广告"),
            h("span", { style: { padding: "5px 9px", borderRadius: "8px", background: "rgba(255, 255, 255, 0.48)", fontSize: "12px" } }, "听完：听歌奖励"),
            h("span", { style: { padding: "5px 9px", borderRadius: "8px", background: "rgba(255, 255, 255, 0.48)", fontSize: "12px" } }, `广告：${settings.adMaxTimes} 次`),
          ]),
        ]),
        h("div", { style: { ...cardStyle, ...statusTone(), display: "flex", alignItems: "center", gap: "9px", marginTop: "12px", padding: "11px 13px" } }, [
          h("span", { style: { width: "9px", height: "9px", flex: "0 0 auto", borderRadius: "50%", background: statusTone().color, boxShadow: `0 0 0 4px ${statusTone().background}` } }),
          h("span", { style: { fontSize: "13px", fontWeight: "700" } }, `状态：${status.value}`),
          h("span", { style: { marginLeft: "auto", fontSize: "11px", opacity: "0.7" } }, adRunning ? "可随时停止广告" : running ? "请稍候" : "已就绪"),
        ]),
        h("div", { style: { ...cardStyle, marginTop: "12px" } }, [
          sectionTitle("快捷操作", "手动任务会复用当前登录态；广告循环可随时停止。"),
          h("div", { style: { display: "flex", flexWrap: "wrap", gap: "8px" } }, [
            actionButton("执行完整任务", "daily", secondaryButtonStyle),
            actionButton("签到", "checkin", buttonStyle),
            actionButton("广告签到", "ad", buttonStyle),
            actionButton("听歌奖励", "listen", buttonStyle),
            actionButton("VIP 查询", "vip", quietButtonStyle),
            stopButton(),
          ]),
        ]),
        h("div", { style: { ...cardStyle, marginTop: "12px" } }, [
          sectionTitle("自动化", "默认开启；酷狗接口今日已领取时会自动返回提示，不会重复增加奖励。"),
          h("div", { style: { display: "grid", gap: "8px" } }, [
            toggleCard("打开时自动签到", "每次打开插件后自动请求签到领取。", autoOpenCheckin.value, updateAutoOpenCheckin, "#2563eb"),
            toggleCard("打开时自动广告签到", "打开插件后开始广告上报，可点击红色按钮立即停止。", autoOpenAd.value, updateAutoOpenAd, "#0f766e"),
            toggleCard("听完一首歌自动领取", "检测歌曲自然结束后领取一次听歌奖励；本次打开周期不重复触发。", autoListenReward.value, updateAutoListenReward, "#7c3aed"),
          ]),
        ]),
        h("details", { style: { ...cardStyle, marginTop: "12px" } }, [
          h("summary", { style: { cursor: "pointer", fontSize: "14px", fontWeight: "800" } }, "高级设置"),
          h("div", { style: { marginTop: "13px" } }, [
            h("label", { style: { display: "block", fontSize: "12px", fontWeight: "700", opacity: "0.72" } }, "MixSongID（可留空，自动读取当前歌曲）"),
            h("input", {
              type: "text",
              value: mixsongId.value,
              placeholder: `自动读取 / 默认 ${DEFAULT_MIXSONG_ID}`,
              onInput: updateMixsongId,
              style: { ...inputStyle, marginTop: "6px" },
            }),
            h("div", { style: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px", marginTop: "12px", fontSize: "13px" } }, [
              h("span", { style: { opacity: "0.72" } }, "广告次数"),
              h("input", { type: "number", min: "1", max: "8", value: adMaxTimes.value, onInput: updateAdMaxTimes, style: smallInputStyle, "aria-label": "广告次数" }),
              h("span", { style: { opacity: "0.72" } }, "次；间隔"),
              h("input", { type: "number", min: "5", max: "120", value: adDelaySeconds.value, onInput: updateAdDelaySeconds, style: smallInputStyle, "aria-label": "广告间隔秒数" }),
              h("span", { style: { opacity: "0.62", fontSize: "12px" } }, "秒（默认 8 × 30 秒）"),
            ]),
          ]),
        ]),
        h("div", { style: { marginTop: "14px" } }, [
          sectionTitle("运行日志", "仅保存最近 40 条，不保存 token、userid 或 dfid。"),
          h("pre", {
            key: logTick.value,
            style: {
              boxSizing: "border-box",
              minHeight: "96px",
              maxHeight: "280px",
              margin: "0",
              padding: "12px 13px",
              overflowY: "auto",
              whiteSpace: "pre-wrap",
              overflowWrap: "anywhere",
              border: "1px solid rgba(30, 41, 59, 0.8)",
              borderRadius: "11px",
              background: "#0f172a",
              color: "#e2e8f0",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
              fontSize: "12px",
              lineHeight: "1.65",
              textShadow: "none",
            },
          }, logs.join("\n") || "暂无日志"),
        ]),
      ]);
    },
  });

  ctx.ui.settings.define({
    id: "default",
    title: "酷狗奖励",
    description: "打开自动签到，听完歌曲自动领取奖励",
    component,
  });

  startPlaybackWatcher();

  if (settings.autoOpenCheckin || settings.autoOpenAd) {
    setTimeout(() => run("open"), AUTO_TASK_DELAY_MS);
  }
}
