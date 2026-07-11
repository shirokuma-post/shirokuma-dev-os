import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { slugify } = require("../src/slugify.js");

test("slug は小文字・ハイフン区切り", () => {
  assert.equal(slugify("Hello World"), "hello-world");
});

test("前後の空白を落とす", () => {
  assert.equal(slugify("  My Post  "), "my-post");
});
