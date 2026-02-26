import test from "node:test";
import assert from "node:assert/strict";
import { paginationWindow, splitPigeonMessages } from "../src/view-models.ts";

test("splitPigeonMessages separates inbox and outbox by Sent: prefix", () => {
  const data = [
    { id: 1, subject: "Hello" },
    { id: 2, subject: "Sent: Follow up" },
    { id: 3, subject: "War plans" },
  ];
  const { inbox, outbox } = splitPigeonMessages(data);
  assert.equal(inbox.length, 2);
  assert.equal(outbox.length, 1);
  assert.equal(outbox[0].subject, "Sent: Follow up");
});

test("paginationWindow computes start/end bounds", () => {
  assert.deepEqual(paginationWindow(0, 0, 20), { start: 0, end: 0 });
  assert.deepEqual(paginationWindow(101, 0, 20), { start: 1, end: 20 });
  assert.deepEqual(paginationWindow(101, 5, 20), { start: 101, end: 101 });
});
