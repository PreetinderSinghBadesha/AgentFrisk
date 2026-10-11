import { describe, expect, it } from "vitest";
import { autosubmitWrite } from "../../src/rules/autosubmit-write.js";
import { fakeTool } from "../helpers.js";

describe("autosubmit-write", () => {
  it("flags autosubmitting forms that write or destroy", () => {
    expect(autosubmitWrite.check(fakeTool({ name: "subscribe", autosubmit: true, effect: "write" }))).toBe(
      'Form tool "subscribe" has toolautosubmit and performs a write action without the user clicking submit.',
    );
    expect(autosubmitWrite.check(fakeTool({ name: "delete_booking", autosubmit: true, effect: "destructive" }))).toBe(
      'Form tool "delete_booking" has toolautosubmit and performs a destructive action without the user clicking submit.',
    );
  });

  it("allows read forms with autosubmit and write forms without it", () => {
    expect(autosubmitWrite.check(fakeTool({ autosubmit: true, effect: "read" }))).toBeNull();
    expect(autosubmitWrite.check(fakeTool({ autosubmit: false, effect: "destructive" }))).toBeNull();
  });

  it("only applies to declarative tools", () => {
    expect(autosubmitWrite.check(fakeTool({ style: "imperative", autosubmit: true, effect: "write" }))).toBeNull();
  });
});
