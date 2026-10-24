// Electron shell for the AppImages: serves the Vite build from app://x85/ (so the site's
// routes work as they do on the web) and grants WebHID access to the Attack Shark keyboard
// (VID 0x3151) only.
const { app, BrowserWindow, net, protocol, session } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const VENDOR_ID = 0x3151;
const DIST = path.join(__dirname, "..", "dist");
// Chromium turns GPU acceleration off for many Linux drivers; the 3D views then render in
// software at a few frames per second. Use the GPU anyway.
app.commandLine.appendSwitch("ignore-gpu-blocklist");
// A small window behind others (the mini app) must keep its pace: no background timer
// throttling, no lowering the renderer's priority, no pausing windows it thinks are covered.
app.commandLine.appendSwitch("disable-background-timer-throttling");
app.commandLine.appendSwitch("disable-renderer-backgrounding");
app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");
// app:// behaves like https: a secure origin (WebHID needs one) with fetch and storage.
protocol.registerSchemesAsPrivileged([{ scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

// X85_SCREENSHOT=<file.png> renders the window off-screen, saves a capture and quits.
const screenshotPath = process.env.X85_SCREENSHOT;
// X85_NO_HID=1 hides the keyboard (used to capture the "not connected" state).
const hidDisabled = process.env.X85_NO_HID === "1";
// X85_MINI=1 opens the mini screen app (set by electron/mini.cjs in the Dorsal Screen AppImage).
const mini = process.env.X85_MINI === "1";

/** Files from dist; any other path is a route of the single-page app. */
function serveDist() {
  protocol.handle("app", (request) => {
    const { pathname } = new URL(request.url);
    const file = path.join(DIST, decodeURIComponent(pathname));
    const inside = file.startsWith(DIST + path.sep);
    const target = inside && fs.existsSync(file) && fs.statSync(file).isFile() ? file : path.join(DIST, "index.html");
    return net.fetch(pathToFileURL(target).toString());
  });
}

function allowHid() {
  const ses = session.defaultSession;
  ses.setPermissionCheckHandler((_wc, permission) => permission === "hid" && !hidDisabled);
  ses.setDevicePermissionHandler((details) => details.deviceType === "hid" && !hidDisabled && details.device.vendorId === VENDOR_ID);
  ses.on("select-hid-device", (event, details, callback) => {
    event.preventDefault();
    // Only the cable (0x5002): the 2.4G dongle answers no configuration command.
    const pick = details.deviceList.find((d) => d.vendorId === VENDOR_ID && d.productId === 0x5002);
    callback(hidDisabled || !pick ? "" : pick.deviceId);
  });
}

/** The configurator's route in the system's language; X85_TAB picks a section (tela, keys…). */
function startPath() {
  const lang = process.env.X85_LANG ?? (app.getLocale().toLowerCase().startsWith("pt") ? "pt" : "en");
  if (mini) return "/mini.html";
  return `${lang === "en" ? "/en" : ""}/app${process.env.X85_TAB ? `/${process.env.X85_TAB}` : ""}`;
}

async function createWindow() {
  const win = new BrowserWindow({
    ...(mini
      ? // The widget draws its own rounded card on a transparent, frameless window.
        { width: 440, height: 620, resizable: false, frame: false, transparent: true, backgroundColor: "#00000000", title: "Dorsal Screen" }
      : { width: 1280, height: 860, minWidth: 420, backgroundColor: "#0a0b0c", title: "Dorsal" }),
    show: !screenshotPath,
    autoHideMenuBar: true,
    icon: path.join(DIST, "icon.png"),
    // A minimised or hidden window would otherwise throttle timers and animations: uploads
    // keep their pace in the background, and captures do not freeze mid-transition.
    webPreferences: { contextIsolation: true, sandbox: true, backgroundThrottling: false },
  });
  // X85_PREVIEW_UPLOAD=<0..1> shows an upload in progress, for screenshots only (no HID traffic).
  // X85_DEMO=1 opens the demo mode: replays a real keyboard's answers, no hardware needed.
  // X85_DEV=1 turns on developer mode (dry run and packet Log).
  // X85_SAMPLE=<image file> preloads it in the screen editor, for screenshots.
  const query = new URLSearchParams({
    // The mini app has no language in its path: X85_LANG reaches it as ?lang.
    ...(mini && process.env.X85_LANG ? { lang: process.env.X85_LANG } : {}),
    ...(process.env.X85_PREVIEW_UPLOAD ? { previewUpload: process.env.X85_PREVIEW_UPLOAD } : {}),
    ...(process.env.X85_DEMO === "1" ? { demo: "1" } : {}),
    ...(process.env.X85_DEV === "1" ? { dev: "1" } : {}),
    ...(process.env.X85_SAMPLE ? { sample: `data:image/png;base64,${fs.readFileSync(process.env.X85_SAMPLE).toString("base64")}` } : {}),
  }).toString();
  await win.loadURL(`app://x85${startPath()}${query ? `?${query}` : ""}`);

  if (screenshotPath) {
    await new Promise((r) => setTimeout(r, Number(process.env.X85_SCREENSHOT_DELAY ?? 2500)));
    const image = await win.webContents.capturePage();
    fs.writeFileSync(screenshotPath, image.toPNG());
    app.quit();
  }
}

app.whenReady().then(() => {
  serveDist();
  allowHid();
  createWindow();
  app.on("activate", () => BrowserWindow.getAllWindows().length === 0 && createWindow());
});

app.on("window-all-closed", () => app.quit());
