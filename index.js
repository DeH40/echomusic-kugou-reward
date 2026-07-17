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

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function nonRetryableError(message) {
  const error = new Error(message);
  error.retryable = false;
  return error;
}

export default async function (ctx) {
  const { defineComponent, h, ref, onUnmounted } = ctx.vue;
  const stored = (await ctx.storage.get(STORAGE_KEY)) || {};
  const settings = {
    autoCheckin: stored.autoCheckin !== false,
    autoAd: stored.autoAd !== false,
    mixsongId: stored.mixsongId || "",
    adMaxTimes: clampInt(stored.adMaxTimes, DEFAULT_AD_MAX_TIMES, 1, 8),
    adDelaySeconds: clampInt(stored.adDelaySeconds, DEFAULT_AD_DELAY_SECONDS, 5, 120),
  };
  const logs = Array.isArray(stored.logs) ? stored.logs.slice(-MAX_LOGS) : [];
  let lastCheckinDate = stored.lastCheckinDate || "";
  let running = false;
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
      autoCheckin: settings.autoCheckin,
      autoAd: settings.autoAd,
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
    const maxTimes = clampInt(settings.adMaxTimes, DEFAULT_AD_MAX_TIMES, 1, 8);
    const delaySeconds = clampInt(settings.adDelaySeconds, DEFAULT_AD_DELAY_SECONDS, 5, 120);
    let claimCount = 0;
    let claimTotal = 0;

    await addLog(`开始广告播放上报，最多 ${maxTimes} 次，间隔 ${delaySeconds} 秒`);

    for (let index = 1; index <= maxTimes; index += 1) {
      claimTotal = index;
      setStatus(`正在广告领取（${index}/${maxTimes}）…`);
      const now = Date.now();
      const payload = await request({
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
      });

      if (Number(payload?.error_code) === AD_EXHAUSTED_CODE) {
        await addLog(`第 ${index} 次广告领取：今天次数已用光`);
        break;
      }

      claimCount += 1;
      await addLog(resultSummary(`第 ${index} 次广告领取成功`, payload));

      if (index < maxTimes) {
        setStatus(`广告领取成功，等待 ${delaySeconds} 秒后继续（${index}/${maxTimes}）…`);
        await addLog(`等待 ${delaySeconds} 秒后进行下一次广告上报…`);
        await sleep(delaySeconds * 1000);
      }
    }

    await addLog(`广告领取完成：成功 ${claimCount}/${claimTotal} 次`);
    notify("success", `广告领取完成：${claimCount}/${claimTotal}`);
    return { claimCount, claimTotal };
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

  /**
   * 对齐 kgcheckin main.js 的每日流程：
   * 1) 听歌领取  2) 广告上报最多 8 次  3) 查询 VIP
   */
  const dailyAll = async (configuredMixsongId) => {
    await addLog("======== 开始每日 VIP 任务 ========");
    setStatus("每日任务：听歌领取…");
    await listenReward(configuredMixsongId);

    if (settings.autoAd) {
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
      return;
    }
    running = true;
    try {
      if (task === "daily") await dailyAll(argument);
      if (task === "checkin") await checkIn();
      if (task === "listen") await listenReward(argument);
      if (task === "ad") await adReward();
      if (task === "vip") await queryVip();
    } catch (error) {
      const message = error?.message || String(error);
      await addLog(`失败：${message}`);
      notify("danger", message);
    } finally {
      running = false;
      setStatus("就绪");
    }
  };

  const component = defineComponent({
    name: "EchoMusicKugouReward",
    setup() {
      const status = ref(statusText);
      const mixsongId = ref(settings.mixsongId);
      const autoCheckin = ref(settings.autoCheckin);
      const autoAd = ref(settings.autoAd);
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

      const updateAutoCheckin = async (event) => {
        autoCheckin.value = Boolean(event?.target?.checked);
        settings.autoCheckin = autoCheckin.value;
        await saveState();
      };

      const updateAutoAd = async (event) => {
        autoAd.value = Boolean(event?.target?.checked);
        settings.autoAd = autoAd.value;
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
        padding: "8px 14px",
        border: "0",
        borderRadius: "7px",
        background: "#2563eb",
        color: "#ffffff",
        fontSize: "13px",
        fontWeight: "600",
        cursor: "pointer",
        boxShadow: "0 1px 2px rgba(0, 0, 0, 0.16)",
      };

      const secondaryButtonStyle = {
        ...buttonStyle,
        background: "#0f766e",
      };

      const inputStyle = {
        width: "100%",
        boxSizing: "border-box",
        padding: "9px 11px",
        border: "1px solid #9ca3af",
        borderRadius: "7px",
        background: "#ffffff",
        color: "#111827",
        fontSize: "14px",
        outline: "none",
      };

      const smallInputStyle = {
        ...inputStyle,
        width: "72px",
        display: "inline-block",
        margin: "0 6px",
        padding: "6px 8px",
      };

      const labelStyle = {
        display: "block",
        margin: "10px 0",
        color: "inherit",
        fontSize: "13px",
      };

      return () => h("div", { style: { padding: "16px", lineHeight: "1.6", color: "inherit" } }, [
        h("h3", { style: { margin: "0 0 8px", color: "inherit", fontWeight: "700" } }, "EchoMusic 酷狗奖励"),
        h("p", {
          style: { color: "inherit", opacity: "0.78", fontSize: "13px", margin: "0 0 8px" },
        }, "复用当前登录态完成概念 VIP 听歌领取与广告播放上报；不保存 token，也不提供会员播放解锁。"),
        h("p", {
          style: { color: "inherit", opacity: "0.72", fontSize: "12px", margin: "0 0 4px" },
        }, "对齐 develop202/kgcheckin：听歌回执 + 广告 play_report（最多 8 次）+ VIP 查询。"),
        h("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap", margin: "12px 0" } }, [
          h("button", { onClick: () => execute("daily"), disabled: running, style: secondaryButtonStyle }, "一键每日任务"),
          h("button", { onClick: () => execute("listen"), disabled: running, style: buttonStyle }, "听歌奖励"),
          h("button", { onClick: () => execute("ad"), disabled: running, style: buttonStyle }, "广告领取"),
          h("button", { onClick: () => execute("checkin"), disabled: running, style: buttonStyle }, "签到领取"),
          h("button", { onClick: () => execute("vip"), disabled: running, style: buttonStyle }, "查询 VIP"),
        ]),
        h("input", {
          type: "text",
          value: mixsongId.value,
          placeholder: `MixSongID（可留空：自动读取 / 默认 ${DEFAULT_MIXSONG_ID}）`,
          onInput: updateMixsongId,
          style: inputStyle,
        }),
        h("label", { style: labelStyle }, [
          h("input", { type: "checkbox", checked: autoCheckin.value, onChange: updateAutoCheckin, style: { accentColor: "#2563eb" } }),
          " 启动后自动执行每日任务（听歌 + 广告）",
        ]),
        h("label", { style: labelStyle }, [
          h("input", { type: "checkbox", checked: autoAd.value, onChange: updateAutoAd, style: { accentColor: "#0f766e" } }),
          " 每日任务中包含广告播放上报",
        ]),
        h("div", { style: { ...labelStyle, display: "flex", alignItems: "center", flexWrap: "wrap", gap: "4px" } }, [
          h("span", null, "广告次数"),
          h("input", {
            type: "number",
            min: "1",
            max: "8",
            value: adMaxTimes.value,
            onInput: updateAdMaxTimes,
            style: smallInputStyle,
          }),
          h("span", null, "次，间隔"),
          h("input", {
            type: "number",
            min: "5",
            max: "120",
            value: adDelaySeconds.value,
            onInput: updateAdDelaySeconds,
            style: smallInputStyle,
          }),
          h("span", null, "秒（对齐上游默认 8×30s）"),
        ]),
        h("div", {
          style: {
            marginTop: "10px",
            padding: "7px 10px",
            borderRadius: "6px",
            background: "rgba(107, 114, 128, 0.12)",
            color: "inherit",
            fontSize: "13px",
            fontWeight: "600",
          },
        }, `状态：${status.value}`),
        h("div", { style: { margin: "14px 0 6px", color: "inherit", fontSize: "13px", fontWeight: "700" } }, "运行日志"),
        h("pre", {
          key: logTick.value,
          style: {
            boxSizing: "border-box",
            minHeight: "82px",
            maxHeight: "280px",
            margin: "0",
            padding: "12px 14px",
            overflowY: "auto",
            whiteSpace: "pre-wrap",
            overflowWrap: "anywhere",
            border: "1px solid #374151",
            borderRadius: "8px",
            background: "#111827",
            color: "#f9fafb",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
            fontSize: "13px",
            lineHeight: "1.65",
            textShadow: "none",
          },
        }, logs.join("\n") || "暂无日志"),
      ]);
    },
  });

  ctx.ui.settings.define({
    id: "default",
    title: "酷狗奖励",
    description: "听歌领取、广告上报与 VIP 状态",
    component,
  });

  if (settings.autoCheckin && lastCheckinDate !== todayKey()) {
    setTimeout(() => run("daily"), 1500);
  }
}
