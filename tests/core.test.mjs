import test from "node:test";
import assert from "node:assert/strict";
import {
  deriveDashboard,
  migrateState,
  normalizeApiOutcome,
  normalizeTrackSnapshot,
  taskIsDone,
  trackEventKey,
} from "../index.js";
import { KugouRewardGateway, RewardTaskEngine } from "../index.js";

test("migrateState creates a versioned daily ledger", () => {
  const state = migrateState({
    autoOpenCheckin: false,
    autoOpenAd: true,
    mixsongId: "12345",
    adMaxTimes: 6,
    logs: ["legacy log"],
  }, Date.UTC(2026, 6, 20, 8));

  assert.equal(state.schemaVersion, 2);
  assert.equal(state.settings.autoDailyClaim, false);
  assert.equal(state.settings.autoAd, true);
  assert.equal(state.settings.manualMixsongId, "12345");
  assert.equal(state.ledger.tasks.adReward.total, 6);
  assert.equal(state.logs[0].message, "legacy log");
  assert.equal(state.ledger.date, "2026-07-20");
});

test("a ledger from a previous day is reset without losing settings", () => {
  const state = migrateState({
    settings: { autoDailyClaim: true, adMaxTimes: 8 },
    ledger: {
      date: "2026-07-19",
      tasks: { dailyClaim: { status: "success" }, adReward: { status: "success", completed: 8 } },
    },
  }, Date.UTC(2026, 6, 20, 8));

  assert.equal(state.settings.autoDailyClaim, true);
  assert.equal(state.ledger.date, "2026-07-20");
  assert.equal(state.ledger.tasks.dailyClaim.status, "pending");
  assert.equal(state.ledger.tasks.adReward.completed, 0);
  assert.equal(taskIsDone(state.ledger.tasks.dailyClaim), false);
});

test("an exhausted ad quota stays completed for the day", () => {
  const state = migrateState({
    settings: { adMaxTimes: 8 },
    ledger: {
      date: "2026-07-20",
      tasks: { adReward: { status: "exhausted", completed: 3, total: 8 } },
    },
  }, Date.UTC(2026, 6, 20, 8));
  assert.equal(state.ledger.tasks.adReward.status, "exhausted");
  assert.equal(taskIsDone(state.ledger.tasks.adReward), true);
});

test("API outcomes distinguish already claimed and exhausted states", () => {
  assert.equal(normalizeApiOutcome({ status: 0, error_code: 130012 }, { alreadyCodes: [130012] }).kind, "already");
  assert.equal(normalizeApiOutcome({ status: 0, error_code: 30002 }, { exhaustedCodes: [30002] }).kind, "exhausted");
  assert.equal(normalizeApiOutcome({ status: 0, error_code: 50001 }).kind, "failure");
  assert.equal(normalizeApiOutcome({ status: 1 }).kind, "success");
});

test("track snapshots prefer a trusted MixSongID and retain display data", () => {
  const track = normalizeTrackSnapshot({
    song: { mixSongId: "987654", name: "测试歌曲", singerName: "测试歌手" },
  });
  assert.deepEqual(track, {
    id: "987654",
    title: "测试歌曲",
    artist: "测试歌手",
    confidence: "high",
  });
  assert.equal(normalizeTrackSnapshot({ name: "没有 ID 的歌曲" }).confidence, "none");
});

test("same playback session produces one stable dedupe key", () => {
  assert.equal(trackEventKey("123", 7, "2026-07-20"), "2026-07-20:7:123");
  assert.equal(trackEventKey("123", 7, "2026-07-20"), trackEventKey("123", 7, "2026-07-20"));
  assert.notEqual(trackEventKey("123", 7, "2026-07-20"), trackEventKey("123", 8, "2026-07-20"));
  assert.equal(trackEventKey("", 7, "2026-07-20"), "");
});

test("dashboard counts only enabled daily tasks", () => {
  const state = migrateState({
    settings: { autoDailyClaim: true, autoAd: false, autoListenReward: true },
  }, Date.UTC(2026, 6, 20, 8));
  state.ledger.tasks.dailyClaim.status = "success";
  const dashboard = deriveDashboard(state);
  assert.equal(dashboard.completed, 1);
  assert.equal(dashboard.total, 2);
  assert.equal(dashboard.tasks.find((task) => task.id === "adReward").status, "disabled");
});

test("request gateway signs each request and normalizes the daily claim", async () => {
  const calls = [];
  const gateway = new KugouRewardGateway({
    ctx: {
      net: {
        fetch: async (url, options) => {
          calls.push({ url, options });
          return { ok: true, status: 200, json: async () => ({ status: 1, msg: "ok" }) };
        },
      },
    },
    authProvider: () => ({ token: "token", userid: "42", dfid: "dfid" }),
    timeoutSeconds: 5,
    log: async () => {},
  });

  const result = await gateway.dailyClaim();
  assert.equal(result.kind, "success");
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /clienttime=/);
  assert.match(calls[0].url, /signature=[a-f0-9]{32}/);
  assert.match(calls[0].url, /source_id=90137/);
  assert.equal(calls[0].options.headers.clienttime.length > 0, true);
});

test("task engine records already-claimed and skips the same task on the next run", async () => {
  const state = migrateState({ settings: { autoDailyClaim: true } }, Date.UTC(2026, 6, 20, 8));
  const logs = [];
  const engine = new RewardTaskEngine({
    state,
    gateway: {
      dailyClaim: async () => ({ kind: "already" }),
    },
    save: async () => {},
    log: async (_level, message) => logs.push(message),
    notify: () => {},
    emit: () => {},
  });

  const first = await engine.run("dailyClaim");
  const second = await engine.run("dailyClaim");
  assert.equal(first.kind, "already");
  assert.equal(second.skipped, true);
  assert.equal(state.ledger.tasks.dailyClaim.status, "already");
  assert.equal(logs.length, 1);
});
