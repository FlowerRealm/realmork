const { contextBridge } = require("electron");

function readArgument(prefix) {
  const arg = process.argv.find((item) => item.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : "";
}

contextBridge.exposeInMainWorld("realmork", {
  apiBaseUrl: readArgument("--realmork-api-base-url="),
  apiToken: readArgument("--realmork-api-token=")
});
