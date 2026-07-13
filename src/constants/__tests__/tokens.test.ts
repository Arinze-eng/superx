import { describe, it, expect } from "vitest";
import { isHeartbeatOk, isSilentReply, HEARTBEAT_OK_TOKEN, SILENT_REPLY_TOKEN } from "../tokens.js";

describe("isHeartbeatOk()", () => {
  // Scenario 5
  it('returns true for exact "NO_ACTION"', () => {
    expect(isHeartbeatOk("NO_ACTION")).toBe(true);
  });

  // Scenario 6
  it("returns true with trailing whitespace/newline", () => {
    expect(isHeartbeatOk("NO_ACTION\n")).toBe(true);
    expect(isHeartbeatOk("NO_ACTION  ")).toBe(true);
    expect(isHeartbeatOk("  NO_ACTION\t")).toBe(true);
  });

  // Scenario 7 — token at end (LLM reasons then concludes NO_ACTION)
  it("returns true when token is at the end", () => {
    expect(isHeartbeatOk("Something NO_ACTION")).toBe(true);
    expect(isHeartbeatOk("OK NO_ACTION")).toBe(true);
    expect(isHeartbeatOk("Checked everything.\nNO_ACTION")).toBe(true);
  });

  it("returns false when token is neither at start (with short suffix) nor at end", () => {
    expect(isHeartbeatOk("The status is NO_ACTION for now but check later")).toBe(false);
  });

  // Scenario 8
  it("returns true for token with short ack suffix", () => {
    expect(isHeartbeatOk("NO_ACTION. All good.")).toBe(true);
    expect(isHeartbeatOk("NO_ACTION — nothing to do")).toBe(true);
  });

  it("returns false for token with very long suffix (>100 chars)", () => {
    const longSuffix = "x".repeat(101);
    expect(isHeartbeatOk(`NO_ACTION ${longSuffix}`)).toBe(false);
  });

  // Scenario 9
  it("returns false for empty string", () => {
    expect(isHeartbeatOk("")).toBe(false);
  });

  it("returns false for null/undefined", () => {
    expect(isHeartbeatOk(null)).toBe(false);
    expect(isHeartbeatOk(undefined)).toBe(false);
  });

  it("exports HEARTBEAT_OK_TOKEN constant", () => {
    expect(HEARTBEAT_OK_TOKEN).toBe("NO_ACTION");
  });
});

describe("isSilentReply()", () => {
  // Scenario 10
  it('returns true for exact "__SILENT__"', () => {
    expect(isSilentReply("__SILENT__")).toBe(true);
  });

  it("returns true with surrounding whitespace", () => {
    expect(isSilentReply("  __SILENT__  ")).toBe(true);
    expect(isSilentReply("__SILENT__\n")).toBe(true);
  });

  // Scenario 11
  it("returns false for non-silent text", () => {
    expect(isSilentReply("not silent")).toBe(false);
    expect(isSilentReply("hello")).toBe(false);
  });

  it("returns true when token is at end (LLM reasons then concludes)", () => {
    expect(isSilentReply("prefix __SILENT__")).toBe(true);
    expect(isSilentReply("Nothing to add.\n__SILENT__")).toBe(true);
  });

  it("returns false when token has content after it", () => {
    expect(isSilentReply("__SILENT__ extra")).toBe(false);
    expect(isSilentReply("__SILENT__ but actually")).toBe(false);
  });

  it("returns false for empty/null/undefined", () => {
    expect(isSilentReply("")).toBe(false);
    expect(isSilentReply(null)).toBe(false);
    expect(isSilentReply(undefined)).toBe(false);
  });

  it("exports SILENT_REPLY_TOKEN constant", () => {
    expect(SILENT_REPLY_TOKEN).toBe("__SILENT__");
  });
});
