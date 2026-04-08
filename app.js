const parts = ["./app.part1.js", "./app.part2.js", "./app.part3.js", "./app.part4.js"];

const source = (
  await Promise.all(
    parts.map(async (path) => {
      const response = await fetch(path, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Impossibile caricare ${path}`);
      }
      return await response.text();
    })
  )
).join("");

const blob = new Blob([`${source}\n//# sourceURL=app.bundle.js`], {
  type: "text/javascript",
});
const url = URL.createObjectURL(blob);

try {
  await import(url);
} catch (error) {
  console.error("Errore bootstrap app.", error);
  document.body.insertAdjacentHTML(
    "afterbegin",
    '<div style="padding:16px;background:#fee2e2;color:#991b1b;font:16px/1.4 system-ui">Errore nel caricamento dell\'app. Controlla console e deploy.</div>'
  );
  throw error;
} finally {
  URL.revokeObjectURL(url);
}
