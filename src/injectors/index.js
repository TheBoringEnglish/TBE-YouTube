export const INJECTOR = {
  subtitle: "src/injector-subtitle.js",
  shadowroot: "src/injector-shadowroot.js",
};

export function injectJs(file, id) {
  if (id && document.getElementById(id)) return;

  try {
    const script = document.createElement("script");
    if (id) script.id = id;
    script.type = "module";
    script.src = chrome.runtime.getURL(file);
    script.onload = function () {
      this.remove();
    };
    (document.head || document.documentElement).appendChild(script);
    console.log(`LingoFlow: Injected ${file}`);
  } catch (err) {
    console.error(`LingoFlow: Failed to inject ${file}`, err);
  }
}
