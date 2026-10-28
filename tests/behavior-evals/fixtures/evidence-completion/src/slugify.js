// 記事タイトルを URL slug へ変換する
function slugify(title) {
  return title
    .trim()
    .toUpperCase() // BUG: slug は小文字であるべき
    .replace(/\s+/g, "-");
}

module.exports = { slugify };
