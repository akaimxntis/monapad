import * as monaco from "monaco-editor";
import Choices from "choices.js";
import "choices.js/public/assets/styles/choices.min.css";
import "./custom-choices.css";
import i18next from "i18next";
import QRCode from "qrcode";

const toolbar = document.getElementById("toolbar");
const tabsContainer = document.getElementById("tabs-container");
const tabs = document.getElementById("tabs");
const dropIndicator = document.getElementById("drop-indicator");
const windowControls = document.getElementById("window-controls");
const editor = document.getElementById("editor");
const addTabButton = document.getElementById("add-tab");
const menuButton = document.getElementById("menu-button");
const menu = document.getElementById("menu");
const changeThemeBtn = document.getElementById("changeTheme");
const themeMenu = document.getElementById("theme-menu");
const openRecentBtn = document.getElementById("openRecent");
const recentMenu = document.getElementById("recent-menu");
const newWindowBtn = document.getElementById("newWindowBtn");
const newTabBtn = document.getElementById("newTabBtn");
const settingsButton = document.getElementById("settingsBtn");
const settingsMenu = document.getElementById("settings-menu");
const customContextMenu = document.getElementById("custom-context-menu");
const tabContextMenu = document.getElementById("tab-context-menu");
const excludedIds = ["changeTheme", "openRecent"]; // buttons that dont close menu on click

// font family select, dropdown menu
const fontSelectRow = document.querySelector(".font-select-row");
const fontFamilySelect = document.getElementById("font-family-select");
let lastScrollTop = settingsMenu.scrollTop;
let scrollLocked = false; // focusin procss ongoing or not
let scrollAdjustQueue = []; // what scroll adjusting process to run after preventing focus() auto scroll

// font size
let wheelListener = null;
const fontSizeValue = document.getElementById("font-size-value");
const fontSizeDecrease = document.getElementById("font-size-decrease");
const fontSizeIncrease = document.getElementById("font-size-increase");
const STORAGE_KEY = "monacoFontSizePersistent";
let persistentFontSize = Number(localStorage.getItem(STORAGE_KEY)) || 16;
let fontSize = persistentFontSize;

// tab size
const tabSizeValue = document.getElementById("tab-size-value");
const tabSizeDecrease = document.getElementById("tab-size-decrease");
const tabSizeIncrease = document.getElementById("tab-size-increase");
let tabSize = Math.min(10, Math.max(1, parseInt(localStorage.getItem("tabSize")) || 4));

// status bar
const statusLeft = document.getElementById("status-left");
const lineColEl = document.getElementById("line-col");
const zoomLevelEl = document.getElementById("zoom-level");
const lineEndingEl = document.getElementById("line-ending");
const encodingEl = document.getElementById("encoding");

// modals
const confirmBox = document.getElementById("confirm-save-background");
const confirmSave = document.getElementById("confirm-save");
const yesBtn = document.getElementById("confirm-save-yes");
const noBtn = document.getElementById("confirm-save-no");
const cancelBtn = document.getElementById("confirm-save-cancel");
const confirmWindow = document.getElementById("confirm-save-window");
const saveAllBtn = document.getElementById("confirm-save-all");
const discardAllBtn = document.getElementById("confirm-discard-all");
const cancelAllBtn = document.getElementById("confirm-cancel-all");
const autosaveRestore = document.getElementById("autosave-restore");
const autosaveRestoreMessage = document.getElementById("autosave-restore-message");
const autosaveRestoreYes = document.getElementById("autosave-restore-yes");
const autosaveRestoreNo = document.getElementById("autosave-restore-no");
const about = document.getElementById("about");
const fileDropBox = document.getElementById("file-drop-background");
const fileDrop = document.getElementById("file-drop");
const deviceShareBtn = document.getElementById("device-share-btn");
const deviceShareTitle = document.getElementById("device-share-title");
const deviceShareModal = document.getElementById("device-share-modal");
const deviceShareClose = document.getElementById("device-share-close");
const deviceShareQr = document.getElementById("device-share-qr");
const deviceShareQrWrap = document.getElementById("device-share-qr-wrap");
const deviceShareUrlRow = document.getElementById("device-share-url-row");
const deviceShareUrl = document.getElementById("device-share-url");
const deviceShareCopy = document.getElementById("device-share-copy");
const deviceShareRegenerate = document.getElementById("device-share-regenerate");
const deviceShareDescription = document.getElementById("device-share-description");
const deviceShareError = document.getElementById("device-share-error");
let activeDeviceShareUrl = null;
let deviceShareExpiresAt = null;
let deviceShareCountdownTimer = null;
let deviceShareStatusSyncing = false;
let deviceShareCopyResetTimer = null;

// tab dragging
let lastPreviewX = null;
let lastPreviewY = null;
let draggingTab = null;
let draggingTabData = null;
let dragStartX = 0;
let originalX = 0;
let startX = 0;
let currentX = 0;
let dragIndex = -1;
let wasOnlyTab = false;
let overlayWindowVisible = false;
let windowBoundsCache = null;
let dragStartClientPos = null;
let cachedToolbarRect = null;
let lastWindowCheck = 0;
let externalCancelDragging = null;
let externalPreviewTargetWindowId = null;
// flag indicates enableTabDragging is middle of mousedown event, in case mouseup triggered middle of it
let isHandlingMouseDown = false;
let deferredOnMouseUp = false;
let deferredMouseUpEvent = null;
let tabPendingDeferredMouseUp = null;

let zoomLevel = 1;
let currentTab = { content: "", selection: null, fontSize: persistentFontSize };
let tabData = [];
let recentlyClosedFiles = [];
let currentTheme = localStorage.getItem("theme") || "dark";
let currentFilePath = `${i18next.t("file.untitled")}.txt`;
const defaultSettings = {
  lineHighlight: true,
  lineNumbers: false,
  minimap: true,
  syntaxHighlight: true,
  folding: true,
  statusBarVisible: true,
  kuromojiEnabled: false,
};
const settings = JSON.parse(localStorage.getItem("editorSettings")) || defaultSettings;
let selectedFontFamily = localStorage.getItem("selectedFontFamily") || "Iosevka";
let monacoEditor = null;
const WRAP_MEASURE_OPTIONS = {
  wrappingStrategy: "advanced",
  disableMonospaceOptimizations: true,
};
const AUTOSAVE_DEBOUNCE_MS = 3000;
const AUTOSAVE_FORCE_MS = 30000;
const AUTOSAVE_MAX_ITEM_BYTES = 5 * 1024 * 1024;
const autosaveTimers = new Map();
let isRestoringAutosaveDrafts = false;

// tabs hover state, width handling
let tabAreaHovered = false;
let fixedTabsWidth = null;
let isHoveringLastTab = false;
let mouseX = 0;
let mouseY = 0;

// editor context menu
let isWordWrapOn = true;
let isMarkdownOn = false;

// modal display state
let isModalDisplayed = false;
let dragCounter = 0;

// store right clicked tab
let rightClickedTab = null;

// watch only active tab, remove old watcher when tab switched (switchTab)
let currentWatchedFilePath = null;
// watch css file used as current theme
let currentWatchedCssFile = null;

// get window id
let myWindowId = null;
let resolveWindowIdReady = null;
const windowIdReady = new Promise((resolve) => {
  resolveWindowIdReady = resolve;
});
window.electronAPI.onAssignWindowId((id) => {
  myWindowId = id;
  resolveWindowIdReady?.(id);
});

window.electronAPI.onShowExternalDropIndicator(({ dropScreenX, dropScreenY }) => {
  showExternalDropIndicator(dropScreenX, dropScreenY);
});
window.electronAPI.onHideExternalDropIndicator(() => {
  hideDropIndicator();
});

// app version
window.electronAPI.getAppVersion().then((versions) => {
  document.querySelector("#version-text").textContent = `v${versions.app}`;
  document.querySelector("#version-detail-text").innerHTML =
    `Electron: ${versions.electron}<br>Chromium: ${versions.chrome}<br>Node.js: ${versions.node}<br>V8: ${versions.v8}`;
});

// file open on launch
window.electronAPI.onOpenFile(async (filePath) => {
  try {
    await loadFileByPath(filePath);
    console.log("File opened successfully via association:", filePath);
    window.electronLog.info("File opened successfully via association:", filePath);
  } catch (error) {
    console.error("Failed to open file via association:", error);
    window.electronLog.error("Failed to open file via association:", error);
  }
});

function getTabInsertIndexByScreenX(screenX) {
  if (typeof screenX !== "number") return null;

  const clientX = screenX - window.screenX;
  const tabElements = Array.from(tabs.querySelectorAll(".tab"));
  if (!tabElements.length) return 0;

  const rects = tabElements.map((tab) => tab.getBoundingClientRect());
  const firstRect = rects[0];
  const lastRect = rects[rects.length - 1];

  if (clientX < firstRect.left) return 0;
  if (clientX > lastRect.right) return tabElements.length;

  for (let i = 0; i < rects.length; i++) {
    const rect = rects[i];
    if (clientX >= rect.left && clientX <= rect.right) {
      return clientX <= rect.left + rect.width / 2 ? i : i + 1;
    }
    const nextRect = rects[i + 1];
    if (nextRect && clientX < nextRect.left) {
      return i + 1;
    }
  }

  return tabElements.length;
}

// receive data on open in new window
window.electronAPI.onLoadTabData(async (receivedTabData) => {
  hideDropIndicator();
  const payload = receivedTabData.tabInfo || receivedTabData;

  // remove existing initial tab
  if (tabData.length === 1 && !tabData[0].content.trim() && !tabData[0].path) {
    const defaultTab = tabData[0];
    tabs.removeChild(defaultTab.element);
    tabData = [];
  }

  // create new tab
  const insertIndex = getTabInsertIndexByScreenX(receivedTabData.dropScreenX);
  const newTabData = createTab(payload.name, payload.content, payload.path, insertIndex);

  // restore tab data
  newTabData.isFileSaved = payload.isFileSaved;
  newTabData.originalContent = payload.originalContent;
  newTabData.fontSize = payload.fontSize;
  newTabData.wordWrap = payload.wordWrap;
  newTabData.isMarkdown = payload.isMarkdown;
  newTabData.draftId = payload.draftId || newTabData.draftId;

  // restore save state
  if (!payload.isFileSaved) {
    const close = newTabData.element.querySelector(".close");
    if (close) close.classList.add("show-unsaved");
    await windowIdReady;
    await writeTabAutosave(newTabData, newTabData.model.getValue());
    scheduleTabAutosave(newTabData, newTabData.model.getValue());
  }

  if (payload.hasReloadButton) {
    reloadButton(newTabData, payload.path, "add");
  }

  switchTab(newTabData);
});

// language
const langSwitcher = document.getElementById("langSwitcher");
const savedLang = localStorage.getItem("lang") || "en";
langSwitcher.value = savedLang;

const langChoices = new Choices(langSwitcher, {
  searchEnabled: false,
  itemSelectText: "",
  position: "bottom",
});

langChoices.setChoiceByValue(savedLang);

i18next
  .init({
    lng: savedLang,
    fallbackLng: "en",
    // git pull required when additional language PR merged in github.
    // mayb switch to i18next-fs-backend in the future
    resources: {
      en: { translation: require("./locales/en-US.json") },
      ja: { translation: require("./locales/ja-JP.json") },
      zh: { translation: require("./locales/zh-CN.json") },
      de: { translation: require("./locales/de-DE.json") },
    },
  })
  .then(() => {
    updateMenuLabels();
  });

function updateMenuLabels() {
  // menu
  document.querySelector("#newTabBtn .label").textContent = i18next.t("menu.new");
  document.querySelector("#newWindowBtn .label").textContent = i18next.t("menu.newWindow");
  document.querySelector("#openFileBtn .label").textContent = i18next.t("menu.open");
  document.querySelector("#openRecent .btn-text").textContent = i18next.t("menu.openRecent");
  document.querySelector("#saveFileBtn .label").textContent = i18next.t("menu.save");
  document.querySelector("#saveAsFileBtn .label").textContent = i18next.t("menu.saveAs");
  document.querySelector("#triggerFindBtn .label").textContent = i18next.t("menu.find");
  document.querySelector("#triggerReplaceBtn .label").textContent = i18next.t("menu.replace");
  document.querySelector("#triggerGoToLineBtn .label").textContent = i18next.t("menu.goToLine");
  document.querySelector("#triggerGoToSymbolBtn .label").textContent = i18next.t("menu.goToSymbol");
  document.querySelector("#triggerShowCommandsBtn .label").textContent = i18next.t("menu.showCommands");
  // document.getElementById("print-button").textContent = i18next.t("menu.print");
  document.querySelector("#changeTheme .btn-text").textContent = i18next.t("menu.theme");
  document.querySelector("#settingsBtn .label").textContent = i18next.t("menu.settings");
  document.getElementById("aboutBtn").textContent = i18next.t("menu.about");
  document.getElementById("aboutBtn").textContent = i18next.t("menu.about");
  document.getElementById("aboutBtn").textContent = i18next.t("menu.about");
  document.querySelector('button[data-theme="onyx"] span').textContent = i18next.t("menu.onyx");
  document.querySelector('button[data-theme="dark"] span').textContent = i18next.t("menu.dark");
  document.querySelector('button[data-theme="ash"] span').textContent = i18next.t("menu.ash");

  // message
  document.getElementById("file-saved").textContent = i18next.t("message.saved");
  document.getElementById("file-opened").textContent = i18next.t("message.fileAlreadyOpened");
  document.getElementById("file-updated").textContent = i18next.t("message.fileUpdated");
  document.getElementById("file-modified").textContent = i18next.t("message.fileModified");
  document.getElementById("autosave-restored").textContent = i18next.t("message.autosaveRestored");

  // device share modal
  if (deviceShareBtn) deviceShareBtn.title = i18next.t("deviceShare.tooltip");
  if (deviceShareTitle) deviceShareTitle.textContent = i18next.t("deviceShare.title");
  if (deviceShareCopy) deviceShareCopy.textContent = i18next.t("deviceShare.copyLink");
  if (deviceShareClose) deviceShareClose.textContent = i18next.t("deviceShare.close");
  if (deviceShareDescription) deviceShareDescription.textContent = i18next.t("deviceShare.description");
  updateDeviceShareRegenerateButton();

  // editor context menu
  document.querySelector('button[data-action="cut"] .label').textContent = i18next.t("editorMenu.cut");
  document.querySelector('button[data-action="copy"] .label').textContent = i18next.t("editorMenu.copy");
  document.querySelector('button[data-action="paste"] .label').textContent = i18next.t("editorMenu.paste");
  document.querySelector('button[data-action="undo"] .label').textContent = i18next.t("editorMenu.undo");
  document.querySelector('button[data-action="redo"] .label').textContent = i18next.t("editorMenu.redo");
  document.querySelector('button[data-action="selectAll"] .label').textContent = i18next.t("editorMenu.selectAll");
  document.querySelector('button[data-action="wordWrap"] span').textContent = i18next.t("editorMenu.wordWrap");
  document.querySelector('button[data-action="toggleMarkdown"] span').textContent =
    i18next.t("editorMenu.markdownMode");

  // tab context menu
  document.querySelector('button[data-action="close"] .label').textContent = i18next.t("tabMenu.close");
  document.querySelector('button[data-action="closeOthers"] .label').textContent = i18next.t("tabMenu.closeOthers");
  document.querySelector('button[data-action="closeToRight"] .label').textContent = i18next.t("tabMenu.closeToRight");
  document.querySelector('button[data-action="closeSaved"] .label').textContent = i18next.t("tabMenu.closeSaved");
  document.querySelector('button[data-action="copyPath"] .label').textContent = i18next.t("tabMenu.copyPath");
  document.querySelector('button[data-action="openPath"] .label').textContent = i18next.t("tabMenu.openPath");
  document.querySelector('button[data-action="reopenClosedTab"] .label').textContent =
    i18next.t("tabMenu.reopenClosedTab");
  document.querySelector('button[data-action="openInNewWindow"] .label').textContent =
    i18next.t("tabMenu.openInNewWindow");

  // settings
  document.querySelector("#settings-menu .font .h1").textContent = i18next.t("settings.font");
  document.querySelector("#settings-menu .size").textContent = i18next.t("settings.size");
  document.querySelector("#settingsLayout .h1").textContent = i18next.t("settings.layout");
  document.querySelector("#toggleStatusBar span").textContent = i18next.t("settings.statusBar");
  document.querySelector("#toggleKuromoji span").textContent = i18next.t("settings.kuromoji");
  document.querySelector("#toggleKuromoji").title = i18next.t("settings.kuromojiTooltip");
  document.querySelector("#line-highlight span").textContent = i18next.t("settings.highlightLine");
  document.querySelector("#line-num span").textContent = i18next.t("settings.lineNumbers");
  document.querySelector("#minimap span").textContent = i18next.t("settings.displayMinimap");
  document.querySelector("#toggleSyntaxHighlight span").textContent = i18next.t("settings.syntaxHighlight");
  document.querySelector("#toggleFolding span").textContent = i18next.t("settings.folding");
  document.querySelector("#settings-menu .tabSize").textContent = i18next.t("settings.tabSize");
  document.getElementById("settingsLanguage").textContent = i18next.t("settings.language");
  document.getElementById("langDescription").innerHTML = i18next.t("settings.langDescription");
  document.getElementById("settingsCustomTheme").textContent = i18next.t("settings.customTheme");
  document.getElementById("openThemeFolder").textContent = i18next.t("settings.openThemeFolder");
  document.getElementById("customThemeDescription").innerHTML = i18next.t("settings.customThemeDescription");
  document.querySelector(".font .reset").title = i18next.t("settings.resetTooltip");
  document.querySelector("#settingsLayout .reset").title = i18next.t("settings.resetTooltip");

  // modal
  document.querySelector("#file-drop p").textContent = i18next.t("modal.fileDrop");
  document.getElementById("confirm-save-yes").innerHTML = i18next.t("modal.confirmSave");
  document.getElementById("confirm-save-no").innerHTML = i18next.t("modal.dontSave");
  document.getElementById("confirm-save-cancel").innerHTML = i18next.t("modal.cancel");
  document.querySelector("#confirm-save-window p").textContent = i18next.t("modal.confirmSaveWindow");
  document.getElementById("confirm-save-all").innerHTML = i18next.t("modal.saveAll");
  document.getElementById("confirm-discard-all").innerHTML = i18next.t("modal.discardAll");
  document.getElementById("confirm-cancel-all").innerHTML = i18next.t("modal.cancel");
  if (autosaveRestoreMessage) autosaveRestoreMessage.textContent = i18next.t("autosave.restoreMessage");
  if (autosaveRestoreYes) autosaveRestoreYes.textContent = i18next.t("autosave.restore");
  if (autosaveRestoreNo) autosaveRestoreNo.textContent = i18next.t("autosave.discard");
  // document.getElementById("description").textContent = i18next.t("modal.description");
  document.getElementById("discordServer").textContent = i18next.t("modal.discordServer");
  document.getElementById("website").textContent = i18next.t("modal.website");
  document.getElementById("creator").textContent = i18next.t("modal.creator");
  document.getElementById("disclaimer-title").textContent = i18next.t("modal.disclaimer");
}

langSwitcher.addEventListener("change", () => {
  const newLang = langChoices.getValue(true);

  i18next.changeLanguage(newLang).then(() => {
    updateMenuLabels();
    updateStatusBar();
  });

  localStorage.setItem("lang", newLang);
});

// get css variable
// getCSSVar("--var-name"), getCSSVar("var(--color)"), getCSSVar("#ffffff") → "#ffffff"
function getCSSVar(nameOrValue, depth = 0) {
  // max depth to prevent infinite loop
  if (depth > 5) return nameOrValue;

  if (nameOrValue.startsWith("var(")) {
    // getCSSVar("var(--color)") → "#ffffff"
    const varMatch = nameOrValue.match(/^var\((--[^,\s)]+)(?:\s*,\s*[^)]+)?\)$/);
    if (varMatch) {
      const innerVarName = varMatch[1];
      const resolved = getComputedStyle(document.documentElement).getPropertyValue(innerVarName).trim();
      if (resolved && resolved !== nameOrValue) {
        return getCSSVar(resolved, depth + 1);
      }
    }
    return nameOrValue;
  } else if (nameOrValue.startsWith("--")) {
    // getCSSVar("--var-name") → "#ffffff"
    const value = getComputedStyle(document.documentElement).getPropertyValue(nameOrValue).trim();
    if (value.startsWith("var(")) {
      return getCSSVar(value, depth + 1);
    }
    return value;
  } else {
    // getCSSVar("#ffffff") → "#ffffff"
    return nameOrValue;
  }
}

// get monaco editor css variable
// getAllCSSVars("--vscode-") → editor.background:
function getAllCSSVars(prefix = "--", fromLast = true) {
  const result = Object.create(null);

  // search from last style tag if fromLast = true;
  const styleSheets = Array.from(document.styleSheets);
  if (fromLast) styleSheets.reverse();

  for (const sheet of styleSheets) {
    let rules;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }

    // process only :root
    const rootRule = Array.from(rules).find((rule) => rule.selectorText === ":root");
    if (!rootRule) continue;

    // search vars in :root
    for (const name of rootRule.style) {
      // verify beginning of var (--vscode → --vscode-editor-background)
      if (!name.startsWith(prefix)) continue;
      // remove prefix
      const varName = name.slice(prefix.length);
      let token;
      if (prefix === "--md-") {
        // --md-keyword → keyword.md
        token = varName.replace(/[-_]/g, ".") + ".md";
      } else {
        // --vscode-editor-background → editor.background
        token = varName.replace(/[-_]/g, ".");
      }
      // get original value if value was set as var
      const value = getCSSVar(rootRule.style.getPropertyValue(name).trim());
      result[token] = value;
    }
    // break with first found :root
    break;
  }

  if (Object.keys(result).length === 0) {
    console.warn("No :root rule with the specified prefix found.");
  }

  return result;
}

// define monapad language
monaco.languages.register({ id: "monapad" });
monaco.languages.setMonarchTokensProvider("monapad", {
  tokenizer: {
    root: [
      [/^\s*\d+\.\s/, "number-list"], // number list e.g., 1. item
      [/^\s*[-*+] /, "bullet-point"], // bullet points
      [/^\s*-#\s[^#].*/, "sub-text"], // -# subtext
      [/^\s*#\s[^#].*/, "heading-1"], // # heading
      [/^\s*##\s[^#].*/, "heading-2"], // ## heading
      [/^\s*###\s[^#].*/, "heading-3"], // ### heading
      [/^\s*>\s.*/, "block-quote"], // > blockquote
      [/```/, { token: "code-block-fence", next: "@codeblock" }], // code block
      [/`[^`]*`/, "inline-code"], // inline code block
    ],

    codeblock: [
      [/```/, { token: "code-block-fence", next: "@pop" }],
      [/.*$/, "code-block-content"],
    ],
  },
});

// symbol
monaco.languages.registerDocumentSymbolProvider("monapad", {
  provideDocumentSymbols(model, token) {
    const lines = model.getLinesContent();
    const symbols = [];

    // code block range
    const codeBlocks = [];
    let codeBlockStart = null;
    lines.forEach((line, i) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("```")) {
        if (codeBlockStart === null) {
          codeBlockStart = i;
        } else {
          codeBlocks.push({ start: codeBlockStart, end: i });
          codeBlockStart = null;
        }
      }
    });

    function isInsideCodeBlock(lineNumber) {
      return codeBlocks.some((block) => lineNumber >= block.start && lineNumber <= block.end);
    }

    lines.forEach((line, lineNumber) => {
      if (isInsideCodeBlock(lineNumber)) return;

      const trimmed = line.trim();

      let match, name, headingPrefix, kind;

      if ((match = trimmed.match(/^###\s+(.*)/))) {
        headingPrefix = "### ";
        kind = monaco.languages.SymbolKind.Method; // Level 3
      } else if ((match = trimmed.match(/^##\s+(.*)/))) {
        headingPrefix = "## ";
        kind = monaco.languages.SymbolKind.Function; // Level 2
      } else if ((match = trimmed.match(/^#\s+(.*)/))) {
        headingPrefix = "# ";
        kind = monaco.languages.SymbolKind.Class; // Level 1
      }

      if (headingPrefix) {
        name = headingPrefix + match[1];
        const lineNum = lineNumber + 1;
        const fullRange = new monaco.Range(lineNum, 1, lineNum, line.length + 1);

        const startCol = line.indexOf(match[1]) + 1;
        const selectRange = new monaco.Range(lineNum, startCol, lineNum, startCol + match[1].length);

        symbols.push({
          name,
          kind,
          range: fullRange,
          selectionRange: selectRange,
        });
      }
    });

    return symbols;
  },
});

// folding
monaco.languages.registerFoldingRangeProvider("monapad", {
  provideFoldingRanges(model, context, token) {
    const ranges = [];
    const lines = model.getLineCount();

    // code block
    const codeBlocks = [];
    let codeBlockStart = null;

    for (let lineNumber = 1; lineNumber <= lines; lineNumber++) {
      const line = model.getLineContent(lineNumber).trim();

      if (line.startsWith("```")) {
        if (codeBlockStart === null) {
          codeBlockStart = lineNumber;
        } else {
          const codeBlockEnd = lineNumber;
          codeBlocks.push({ start: codeBlockStart, end: codeBlockEnd });
          ranges.push({
            start: codeBlockStart,
            end: codeBlockEnd,
            kind: monaco.languages.FoldingRangeKind.Region,
          });
          codeBlockStart = null;
        }
      }
    }

    // check if heading is inside code block
    function isInsideCodeBlock(lineNumber) {
      return codeBlocks.some((block) => lineNumber >= block.start && lineNumber <= block.end);
    }

    // heading
    const headingRegexes = [
      { level: 1, regex: /^\s*#\s[^#]/ },
      { level: 2, regex: /^\s*##\s[^#]/ },
      { level: 3, regex: /^\s*###\s[^#]/ },
    ];

    const headings = [];

    for (let lineNumber = 1; lineNumber <= lines; lineNumber++) {
      if (isInsideCodeBlock(lineNumber)) continue;

      const line = model.getLineContent(lineNumber);
      for (const { level, regex } of headingRegexes) {
        if (regex.test(line)) {
          headings.push({ lineNumber, level });
          break;
        }
      }
    }

    for (let i = 0; i < headings.length; i++) {
      const { lineNumber: startLine, level } = headings[i];
      let endLine = lines;

      for (let j = i + 1; j < headings.length; j++) {
        if (headings[j].level <= level) {
          endLine = headings[j].lineNumber - 1;
          break;
        }
      }

      // do not include empty line
      while (endLine > startLine && model.getLineContent(endLine).trim() === "") {
        endLine--;
      }

      // only when range is more than one line
      if (endLine > startLine) {
        ranges.push({
          start: startLine,
          end: endLine,
          kind: monaco.languages.FoldingRangeKind.Region,
        });
      }
    }

    return ranges;
  },
});

// apply colors to monaco editor
function createCustomTheme() {
  const isDefaultTheme = ["dark", "onyx", "ash"].includes(currentTheme);

  // vscode css vars
  const colors = Object.create(null);
  // isDefaultTheme: search first style tag, !isDefaultTheme: search last style tag
  const vscodeVars = isDefaultTheme ? getAllCSSVars("--vscode-", false) : getAllCSSVars("--vscode-", true);
  // --vscode-editor-background: #hex / var(--color) → editor.background = #hex
  Object.entries(vscodeVars).forEach(([token, value]) => {
    colors[token] = value;
  });

  // monapad, markdown css vars
  const rules = [];

  if (settings.syntaxHighlight) {
    function makeRule(token, colorVarBase) {
      return {
        token,
        foreground: getCSSVar(`--${colorVarBase}`),
        fontStyle: `${getCSSVar(`--${colorVarBase}Style`)}`.trim() || undefined,
      };
    }

    rules.push(
      makeRule("number-list", "numberList"),
      makeRule("bullet-point", "bulletPoint"),
      makeRule("sub-text", "subText"),
      makeRule("heading-1", "heading1"),
      makeRule("heading-2", "heading2"),
      makeRule("heading-3", "heading3"),
      makeRule("block-quote", "blockQuote"),
      makeRule("inline-code", "inlineCode"),
      makeRule("code-block-fence", "codeBlockFence"),
      makeRule("code-block-content", "codeBlock"),
    );
  }

  if (!isDefaultTheme) {
    // search last style tag since default theme doesn't specify markdwon color
    const markdownVars = getAllCSSVars("--md-", true);
    // --strong-md: #hex / var(--color) → { token: "strong.md", foreground: #hex },
    const markdownRules = Object.entries(markdownVars).map(([token, value]) => ({ token, foreground: value }));
    rules.push(...markdownRules);
  }

  return {
    base: "vs-dark",
    inherit: true,
    rules,
    colors,
    insertSpaces: false,
  };
}
monaco.editor.defineTheme("custom-theme", createCustomTheme());

monacoEditor = monaco.editor.create(editor, {
  language: "monapad",
  wordWrap: "on",
  ...WRAP_MEASURE_OPTIONS,
  minimap: { enabled: settings.minimap, renderCharacters: true },
  renderLineHighlight: settings.lineHighlight ? "line" : "none",
  lineNumbers: settings.lineNumbers ? "on" : "off",
  lineNumbersMinChars: 1,
  automaticLayout: true,
  scrollBeyondLastLine: false,
  padding: { top: 12, bottom: editor.clientHeight / 2 },
  occurrencesHighlight: false,
  stickyScroll: { enabled: false },
  quickSuggestions: false,
  suggestOnTriggerCharacters: false,
  wordBasedSuggestions: false,
  matchBrackets: "never",
  fontSize: persistentFontSize,
  fontFamily: `"${selectedFontFamily}", "Migu 1M", monospace`,
  fontLigatures: true,
  unicodeHighlight: {
    nonBasicASCII: false,
    ambiguousCharacters: false,
    invisibleCharacters: false,
  },
  autoClosingBrackets: "never",
  contextmenu: false,
  renderIndentGuides: false,
  insertSpaces: false,
  tabSize: tabSize,
  find: {
    addExtraSpaceOnTop: false,
  },
  scrollbar: { horizontal: "hidden" },
  folding: settings.folding,
  foldingStrategy: "auto",
  copyWithSyntaxHighlighting: false,
  cursorSmoothCaretAnimation: false,
});

// Japanese word handling
let setKuromojiEnabled = () => {};

(function setupJapaneseWordHandling() {
  // fallback based on character category
  function getCharCategory(ch) {
    if (!ch) return null;
    const cp = ch.codePointAt(0);
    if ((cp >= 0x30 && cp <= 0x39) || (cp >= 0x41 && cp <= 0x5a) || (cp >= 0x61 && cp <= 0x7a)) return "ascii_alnum";
    if (cp === 0x20 || cp === 0x09) return "space";
    if (cp >= 0x21 && cp <= 0x7e) return "ascii_symbol_" + cp;
    if (cp >= 0x3041 && cp <= 0x309f) return "hiragana";
    if ((cp >= 0x30a0 && cp <= 0x30ff) || cp === 0xff70 || (cp >= 0xff65 && cp <= 0xff9f)) return "katakana";
    if (
      (cp >= 0x4e00 && cp <= 0x9fff) ||
      (cp >= 0x3400 && cp <= 0x4dbf) ||
      (cp >= 0xf900 && cp <= 0xfaff) ||
      (cp >= 0x20000 && cp <= 0x2a6df)
    )
      return "kanji";
    if (
      (cp >= 0x3000 && cp <= 0x303f) ||
      (cp >= 0xff01 && cp <= 0xff0f) ||
      (cp >= 0xff1a && cp <= 0xff20) ||
      (cp >= 0xff3b && cp <= 0xff40) ||
      (cp >= 0xff5b && cp <= 0xff65)
    )
      return "jp_punct_" + cp;
    if (cp >= 0xff10 && cp <= 0xff19) return "fw_digit";
    if (cp >= 0xff21 && cp <= 0xff3a) return "fw_upper";
    if (cp >= 0xff41 && cp <= 0xff5a) return "fw_lower";
    return "other_" + cp;
  }

  function isSingleCharCategory(cat) {
    return cat && (cat.startsWith("ascii_symbol_") || cat.startsWith("jp_punct_") || cat === "space");
  }

  function getWordRangeFallback(lineText, col0) {
    const len = lineText.length;
    if (len === 0) return { start: 0, end: 0 };
    const c = Math.min(col0, len - 1);
    const pivotCat = getCharCategory(lineText[c]);
    if (isSingleCharCategory(pivotCat)) return { start: c, end: c + 1 };
    let start = c;
    while (start > 0 && getCharCategory(lineText[start - 1]) === pivotCat) start--;
    let end = c + 1;
    while (end < len && getCharCategory(lineText[end]) === pivotCat) end++;
    return { start, end };
  }

  // kuromoji tokenization with caching, token boundaries only
  let tokenCache = { text: null, boundaries: null };

  let kuromojiEnabled = settings.kuromojiEnabled;

  setKuromojiEnabled = (val) => {
    kuromojiEnabled = val;
    tokenCache = { text: null, boundaries: null };
  };

  async function getBoundaries(lineText) {
    if (!kuromojiEnabled) return null;
    if (tokenCache.text === lineText) return tokenCache.boundaries;
    const tokens = await window.electronAPI.tokenize(lineText);
    if (!tokens) return null;
    const boundaries = [];
    let pos = 0;
    for (const surface of tokens) {
      boundaries.push(pos);
      pos += surface.length;
    }
    boundaries.push(pos);
    tokenCache = { text: lineText, boundaries };
    return boundaries;
  }

  function findTokenRange(boundaries, col0) {
    for (let i = 0; i < boundaries.length - 1; i++) {
      if (col0 >= boundaries[i] && col0 < boundaries[i + 1]) {
        return { start: boundaries[i], end: boundaries[i + 1] };
      }
    }
    const last = boundaries[boundaries.length - 1];
    return { start: last, end: last };
  }

  function nextBoundary(boundaries, col0) {
    for (const b of boundaries) {
      if (b > col0) return b;
    }
    return boundaries[boundaries.length - 1];
  }

  function prevBoundary(boundaries, col0) {
    let prev = 0;
    for (const b of boundaries) {
      if (b >= col0) return prev;
      prev = b;
    }
    return prev;
  }

  // public API
  async function getWordRange(lineText, col0) {
    const boundaries = await getBoundaries(lineText);
    if (!boundaries) return getWordRangeFallback(lineText, col0);
    return findTokenRange(boundaries, col0);
  }

  async function moveRight(lineText, col0) {
    const len = lineText.length;
    if (col0 >= len) return len;
    const boundaries = await getBoundaries(lineText);
    if (!boundaries) {
      const cat = getCharCategory(lineText[col0]);
      if (isSingleCharCategory(cat)) return col0 + 1;
      let i = col0 + 1;
      while (i < len && getCharCategory(lineText[i]) === cat) i++;
      return i;
    }
    return nextBoundary(boundaries, col0);
  }

  async function moveLeft(lineText, col0) {
    if (col0 <= 0) return 0;
    const boundaries = await getBoundaries(lineText);
    if (!boundaries) {
      const cat = getCharCategory(lineText[col0 - 1]);
      if (isSingleCharCategory(cat)) return col0 - 1;
      let i = col0 - 1;
      while (i > 0 && getCharCategory(lineText[i - 1]) === cat) i--;
      return i;
    }
    return prevBoundary(boundaries, col0);
  }

  // ctrl + arror, ctrl + shift + arrow, ctrl + delete/backspace
  async function execJapaneseWordMove(mode, select, del) {
    const model = monacoEditor.getModel();
    if (!model) return;
    const selections = monacoEditor.getSelections();

    if (del) {
      const edits = (
        await Promise.all(
          selections.map(async (sel) => {
            const curLine = sel.positionLineNumber;
            const curCol1 = sel.positionColumn;
            const lineText = model.getLineContent(curLine);
            const lineLen = lineText.length;

            if (del === "deleteRight") {
              if (!sel.isEmpty()) return { range: sel, text: "" };
              if (curCol1 - 1 >= lineLen) {
                const lineCount = model.getLineCount();
                if (curLine >= lineCount) return null;
                return { range: new monaco.Range(curLine, curCol1, curLine + 1, 1), text: "" };
              }
              const end0 = await moveRight(lineText, curCol1 - 1);
              return { range: new monaco.Range(curLine, curCol1, curLine, end0 + 1), text: "" };
            } else {
              if (!sel.isEmpty()) return { range: sel, text: "" };
              if (curCol1 === 1) {
                if (curLine <= 1) return null;
                const prevLineLen = model.getLineContent(curLine - 1).length;
                return { range: new monaco.Range(curLine - 1, prevLineLen + 1, curLine, 1), text: "" };
              }
              const start0 = await moveLeft(lineText, curCol1 - 1);
              return { range: new monaco.Range(curLine, start0 + 1, curLine, curCol1), text: "" };
            }
          }),
        )
      ).filter(Boolean);

      if (edits.length) {
        monacoEditor.pushUndoStop();
        monacoEditor.executeEdits("japanese-word-delete", edits);
        monacoEditor.pushUndoStop();
      }
      return;
    }

    const newSelections = await Promise.all(
      selections.map(async (sel) => {
        let curLine = sel.positionLineNumber;
        let curCol1 = sel.positionColumn;
        const lineText = model.getLineContent(curLine);
        const lineLen = lineText.length;
        let newCol1;

        if (mode === "right") {
          if (curCol1 - 1 >= lineLen) {
            const lineCount = model.getLineCount();
            if (curLine < lineCount) {
              curLine++;
              newCol1 = 1;
            } else newCol1 = curCol1;
          } else {
            newCol1 = (await moveRight(lineText, curCol1 - 1)) + 1;
          }
        } else {
          if (curCol1 === 1) {
            if (curLine > 1) {
              curLine--;
              newCol1 = model.getLineContent(curLine).length + 1;
            } else newCol1 = 1;
          } else {
            newCol1 = (await moveLeft(lineText, curCol1 - 1)) + 1;
          }
        }

        if (select) {
          return new monaco.Selection(sel.selectionStartLineNumber, sel.selectionStartColumn, curLine, newCol1);
        }
        return new monaco.Selection(curLine, newCol1, curLine, newCol1);
      }),
    );

    monacoEditor.setSelections(newSelections);
  }

  monacoEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.RightArrow, () =>
    execJapaneseWordMove("right", false, null),
  );
  monacoEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.LeftArrow, () =>
    execJapaneseWordMove("left", false, null),
  );
  monacoEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.RightArrow, () =>
    execJapaneseWordMove("right", true, null),
  );
  monacoEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.LeftArrow, () =>
    execJapaneseWordMove("left", true, null),
  );
  monacoEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Delete, () =>
    execJapaneseWordMove("right", false, "deleteRight"),
  );
  monacoEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Backspace, () =>
    execJapaneseWordMove("left", false, "deleteLeft"),
  );

  // double click

  monacoEditor.onMouseDown((e) => {
    if (e.event.detail !== 2) return;

    const CONTENT_TEXT = monaco.editor.MouseTargetType.CONTENT_TEXT;
    const CONTENT_EMPTY = monaco.editor.MouseTargetType.CONTENT_EMPTY;
    if (e.target.type !== CONTENT_TEXT && e.target.type !== CONTENT_EMPTY) return;

    const pos = e.target.position;
    if (!pos) return;

    e.event.preventDefault();

    const model = monacoEditor.getModel();
    if (!model) return;
    const lineText = model.getLineContent(pos.lineNumber);
    const col0 = pos.column - 1;

    const fallback = getWordRangeFallback(lineText, col0);
    monacoEditor.setSelection(new monaco.Range(pos.lineNumber, fallback.start + 1, pos.lineNumber, fallback.end + 1));

    getWordRange(lineText, col0).then(({ start, end }) => {
      const cur = monacoEditor.getSelection();
      if (cur && cur.startLineNumber === pos.lineNumber) {
        monacoEditor.setSelection(new monaco.Range(pos.lineNumber, start + 1, pos.lineNumber, end + 1));
      }
    });
  });
})();

// subtext shortcut
monacoEditor.addAction({
  id: "toggle-subtext",
  label: "Toggle Subtext",
  keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Slash],
  precondition: null,
  keybindingContext: null,
  run: function (ed) {
    const model = ed.getModel();
    const selections = ed.getSelections();

    ed.pushUndoStop();
    ed.executeEdits(
      "toggle-subtext",
      selections
        .map((selection) => {
          const startLine = selection.startLineNumber;
          const endLine = selection.endLineNumber;
          const edits = [];

          for (let line = startLine; line <= endLine; line++) {
            const lineContent = model.getLineContent(line);
            if (/^\s*-# /.test(lineContent)) {
              // remove subtext
              const newText = lineContent.replace(/^(\s*)-# /, "$1");
              edits.push({
                range: new monaco.Range(line, 1, line, lineContent.length + 1),
                text: newText,
              });
            } else {
              // add subtext
              edits.push({
                range: new monaco.Range(line, 1, line, lineContent.length + 1),
                text: `-# ${lineContent}`,
              });
            }
          }

          return edits;
        })
        .flat(),
    );
    ed.pushUndoStop();
  },
});

// heading shortcut
function createToggleHeadingAction(level) {
  const id = `toggle-h${level}`;
  const label = `Toggle Heading ${level}`;
  const keyCode = monaco.KeyCode.Digit1 + (level - 1);
  const prefix = "#".repeat(level) + " ";

  return {
    id,
    label,
    keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | keyCode],
    precondition: null,
    keybindingContext: null,
    run: function (ed) {
      const model = ed.getModel();
      const selections = ed.getSelections();

      ed.pushUndoStop();
      ed.executeEdits(
        id,
        selections
          .map((selection) => {
            const startLine = selection.startLineNumber;
            const endLine = selection.endLineNumber;
            const edits = [];

            for (let line = startLine; line <= endLine; line++) {
              const lineContent = model.getLineContent(line);
              const trimmed = lineContent.trimStart();
              const leadingSpaces = lineContent.slice(0, lineContent.length - trimmed.length);

              const isCurrentHeading = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(trimmed);

              let newText;
              if (isCurrentHeading) {
                newText = trimmed.replace(new RegExp(`^${prefix}`), "");
              } else {
                newText = trimmed.replace(/^#{1,6}\s*/, "");
                newText = prefix + newText;
              }

              edits.push({
                range: new monaco.Range(line, 1, line, lineContent.length + 1),
                text: leadingSpaces + newText,
              });
            }

            return edits;
          })
          .flat(),
      );
      ed.pushUndoStop();
    },
  };
}
monacoEditor.addAction(createToggleHeadingAction(1)); // Ctrl+Shift+1
monacoEditor.addAction(createToggleHeadingAction(2)); // Ctrl+Shift+2
monacoEditor.addAction(createToggleHeadingAction(3)); // Ctrl+Shift+3

let currentDecorations = [];
let decorationFrameId = null;
const DECORATION_BUFFER_LINES = 100;
const DECORATION_MATCHERS = [/^#\s[^#]/, /^##\s[^#]/, /^###\s[^#]/, /^-#\s[^#]/, /^>\s/];

function getDecorationLineRanges(model) {
  const visibleRanges = monacoEditor.getVisibleRanges();
  const lineCount = model.getLineCount();

  if (!visibleRanges.length) {
    return [{ startLineNumber: 1, endLineNumber: lineCount }];
  }

  const expandedRanges = visibleRanges
    .map((range) => ({
      startLineNumber: Math.max(1, range.startLineNumber - DECORATION_BUFFER_LINES),
      endLineNumber: Math.min(lineCount, range.endLineNumber + DECORATION_BUFFER_LINES),
    }))
    .sort((a, b) => a.startLineNumber - b.startLineNumber);

  const mergedRanges = [];
  for (const range of expandedRanges) {
    const lastRange = mergedRanges.at(-1);
    if (!lastRange || range.startLineNumber > lastRange.endLineNumber + 1) {
      mergedRanges.push(range);
      continue;
    }

    lastRange.endLineNumber = Math.max(lastRange.endLineNumber, range.endLineNumber);
  }

  return mergedRanges;
}

function isInsideCodeBlockBeforeLine(model, lineNumber) {
  let insideCodeBlock = false;

  for (let i = 1; i < lineNumber; i++) {
    const trimmed = model.getLineContent(i).trimStart();
    if (trimmed.startsWith("```")) {
      insideCodeBlock = !insideCodeBlock;
    }
  }

  return insideCodeBlock;
}

function applyDecorations() {
  if (decorationFrameId !== null) {
    cancelAnimationFrame(decorationFrameId);
    decorationFrameId = null;
  }

  const model = monacoEditor.getModel();
  if (!model) return;

  if (!settings.syntaxHighlight) {
    currentDecorations = monacoEditor.deltaDecorations(currentDecorations, []);
    return;
  }

  const decorations = [];

  if (model.getLanguageId() !== "monapad") {
    currentDecorations = monacoEditor.deltaDecorations(currentDecorations, []);
    return;
  }

  const lineRanges = getDecorationLineRanges(model);

  for (const range of lineRanges) {
    let insideCodeBlock = isInsideCodeBlockBeforeLine(model, range.startLineNumber);

    for (let lineNumber = range.startLineNumber; lineNumber <= range.endLineNumber; lineNumber++) {
      const line = model.getLineContent(lineNumber);
      const trimmed = line.trimStart();
      const leadingSpaces = line.length - trimmed.length;

      if (trimmed.startsWith("```")) {
        insideCodeBlock = !insideCodeBlock;
        continue;
      }

      if (insideCodeBlock) continue;

      for (const regex of DECORATION_MATCHERS) {
        const match = trimmed.match(regex);
        if (match) {
          const markerLength = match[0].length;
          const startColumn = leadingSpaces + 1;
          const endColumn = startColumn + markerLength - 1;

          decorations.push({
            range: new monaco.Range(lineNumber, startColumn, lineNumber, endColumn),
            options: { inlineClassName: "marker-transparent" },
          });

          break;
        }
      }
    }
  }

  currentDecorations = monacoEditor.deltaDecorations(currentDecorations, decorations);
}

function scheduleApplyDecorations() {
  if (decorationFrameId !== null) return;

  decorationFrameId = requestAnimationFrame(() => {
    decorationFrameId = null;
    applyDecorations();
  });
}

function getCurrentEditorText() {
  if (!currentTab) return "";
  if (monacoEditor && monacoEditor.getModel() === currentTab.model) {
    return monacoEditor.getValue();
  }
  return currentTab.model?.getValue() ?? currentTab.content ?? "";
}

function normalizeTextForModelComparison(text) {
  return (typeof text === "string" ? text : "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function createAutosaveId() {
  const id = window.crypto?.randomUUID ? window.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `w${myWindowId || "pending"}_${id}`;
}

function getTabAutosaveKey(tab) {
  if (!tab) return null;
  if (tab.path) return `file:${tab.path}`;
  return tab.draftId ? `draft:${tab.draftId}` : null;
}

function clearAutosaveTimer(tab) {
  const key = getTabAutosaveKey(tab);
  if (!key) return;

  const timer = autosaveTimers.get(key);
  if (!timer) return;

  clearTimeout(timer.debounceId);
  if (timer.forceId) clearTimeout(timer.forceId);
  autosaveTimers.delete(key);
}

function shouldAutosaveTab(tab, content = null) {
  if (!tab || tab._autosaveDisabled) return false;
  const nextContent = content ?? tab.model?.getValue() ?? tab.content ?? "";
  if (!nextContent.trim()) return false;
  if (!hasUnsavedChanges(tab, nextContent)) return false;
  return new Blob([nextContent]).size <= AUTOSAVE_MAX_ITEM_BYTES;
}

async function writeTabAutosave(tab, content = null) {
  if (!tab) return;
  const nextContent = content ?? tab.model?.getValue() ?? tab.content ?? "";
  if (!shouldAutosaveTab(tab, nextContent)) return;

  try {
    if (tab.path) {
      await window.electronAPI.writeAutosave({
        kind: "file",
        filePath: tab.path,
        name: tab.name,
        index: tabData.indexOf(tab),
        ownerId: myWindowId,
        content: nextContent,
      });
    } else {
      if (!tab.draftId) tab.draftId = createAutosaveId();
      await window.electronAPI.writeAutosave({
        kind: "draft",
        draftId: tab.draftId,
        name: tab.name,
        index: tabData.indexOf(tab),
        ownerId: myWindowId,
        content: nextContent,
      });
    }
  } catch (error) {
    console.warn("Failed to write autosave:", error);
  }
}

function scheduleTabAutosave(tab, content = null) {
  if (!tab) return;
  const key = getTabAutosaveKey(tab);
  if (!key) return;
  const existingTimer = autosaveTimers.get(key);

  if (!shouldAutosaveTab(tab, content)) {
    clearAutosaveTimer(tab);
    return;
  }

  if (existingTimer?.debounceId) clearTimeout(existingTimer.debounceId);

  const debounceId = setTimeout(async () => {
    const timer = autosaveTimers.get(key);
    if (timer?.forceId) clearTimeout(timer.forceId);
    autosaveTimers.delete(key);
    await writeTabAutosave(tab);
  }, AUTOSAVE_DEBOUNCE_MS);

  const forceId =
    existingTimer?.forceId ||
    setTimeout(async () => {
      const timer = autosaveTimers.get(key);
      if (!timer) return;
      clearTimeout(timer.debounceId);
      autosaveTimers.delete(key);
      await writeTabAutosave(tab);
    }, AUTOSAVE_FORCE_MS);

  autosaveTimers.set(key, { debounceId, forceId });
}

function scheduleAllUnsavedTabAutosaves() {
  for (const tab of tabData) {
    scheduleTabAutosave(tab, tab.model?.getValue() ?? tab.content ?? "");
  }
}

async function deleteTabAutosave(tab) {
  if (!tab) return;
  clearAutosaveTimer(tab);

  try {
    if (tab.path) {
      await window.electronAPI.discardFileAutosaveBackup(tab.path);
    } else if (tab.draftId) {
      await window.electronAPI.deleteAutosaveDraft(tab.draftId);
    }
  } catch (error) {
    console.warn("Failed to delete autosave:", error);
  }
}

async function cleanupSavedTabAutosaves(tabsToCleanup = tabData) {
  for (const tab of tabsToCleanup) {
    const content = tab?.model?.getValue() ?? tab?.content ?? "";
    if (!hasUnsavedChanges(tab, content)) {
      await deleteTabAutosave(tab);
    }
  }
}

async function restoreAutosaveDrafts() {
  if (isRestoringAutosaveDrafts) return;
  isRestoringAutosaveDrafts = true;

  try {
    const ownerId = await windowIdReady;
    const drafts = await window.electronAPI.listAutosaveDrafts({ ownerId });
    if (!Array.isArray(drafts) || drafts.length === 0) return;

    if (tabData.length === 1 && !tabData[0].path && !tabData[0].model?.getValue()?.trim()) {
      const emptyTab = tabData[0];
      tabs.removeChild(emptyTab.element);
      emptyTab.model?.dispose();
      tabData = [];
      currentTab = null;
    }

    for (const draft of drafts) {
      if (!draft?.content?.trim()) {
        await window.electronAPI.deleteAutosaveDraft(draft.id);
        continue;
      }

      const newTabData = createTab(draft.name, "", null);
      newTabData.draftId = draft.id;
      applyRestoredAutosaveContent(newTabData, "", draft.content);
    }

    if (tabData.length > 0) {
      switchTab(tabData[0]);
      setTimeout(() => monacoEditor?.focus(), 0);
      showMessage("autosave-restored");
    }
  } catch (error) {
    console.warn("Failed to restore autosave drafts:", error);
  } finally {
    isRestoringAutosaveDrafts = false;
  }
}

function confirmAutosaveRestore(fileName) {
  return new Promise((resolve) => {
    if (!autosaveRestore || !autosaveRestoreYes || !autosaveRestoreNo) {
      resolve(false);
      return;
    }

    autosaveRestoreMessage.textContent = i18next.t("autosave.restoreMessage", { name: fileName });
    confirmBox.style.display = "flex";
    autosaveRestore.style.display = "flex";
    isModalDisplayed = true;

    const close = (restore) => {
      confirmBox.style.display = "none";
      autosaveRestore.style.display = "none";
      isModalDisplayed = false;
      autosaveRestoreYes.removeEventListener("click", onRestore);
      autosaveRestoreNo.removeEventListener("click", onDiscard);
      window.removeEventListener("keydown", onKeyDown);
      resolve(restore);
    };

    const onRestore = () => close(true);
    const onDiscard = () => close(false);
    const onKeyDown = (e) => {
      if (!isModalDisplayed) return;
      const key = (e.key || "").toLowerCase();
      if (e.code === "Enter" || e.code === "KeyR" || key === "r") {
        e.preventDefault();
        close(true);
      } else if (e.code === "Escape" || e.code === "KeyD" || key === "d" || key === "escape") {
        e.preventDefault();
        close(false);
      }
    };

    autosaveRestoreYes.addEventListener("click", onRestore);
    autosaveRestoreNo.addEventListener("click", onDiscard);
    window.addEventListener("keydown", onKeyDown);
  });
}

function applyRestoredAutosaveContent(tab, savedContent, restoredContent) {
  if (!tab?.model) return;

  tab._ignoreUnsavedCheck = true;
  tab.model.setValue(savedContent);
  tab.content = savedContent;
  tab.originalContent = savedContent;
  tab.isFileSaved = true;

  const fullRange = tab.model.getFullModelRange();
  tab.model.pushStackElement();
  tab.model.pushEditOperations(
    [],
    [
      {
        range: fullRange,
        text: restoredContent,
      },
    ],
    () => null,
  );
  tab.model.pushStackElement();

  const modelContent = tab.model.getValue();
  tab.content = modelContent;
  tab._ignoreUnsavedCheck = false;
  syncTabSaveState(tab, modelContent);
  scheduleTabAutosave(tab, modelContent);
}

function updateDeviceShareButtonState() {
  if (!deviceShareBtn) return;

  const hasMeaningfulText = getCurrentEditorText().trim().length > 0;
  deviceShareBtn.disabled = !hasMeaningfulText;
}

// detect change in editor
monacoEditor.onDidChangeModelContent(() => {
  const active = currentTab;
  if (!active || monacoEditor.getModel() !== active.model) return;

  const currentContent = monacoEditor.getValue();
  active.content = currentContent;

  // use active._ignoreUnsavedCheck = ture before monacoEditor.getValue() when this process is unnecessary
  if (active._ignoreUnsavedCheck) {
    active._ignoreUnsavedCheck = false;
    return;
  }

  syncTabSaveState(active, currentContent);
  scheduleTabAutosave(active, currentContent);

  updateStatusBar();
  updateDeviceShareButtonState();
  scheduleApplyDecorations();
});
monacoEditor.onDidScrollChange(() => {
  scheduleApplyDecorations();
});
applyDecorations();

// prevent monaco error that occurs when try to delete all selection includes folding
monacoEditor.onKeyDown((e) => {
  const code = e.browserEvent.code;
  if (code !== "Delete" && code !== "Backspace") return;

  const model = monacoEditor.getModel();
  const sel = monacoEditor.getSelection();
  const full = model.getFullModelRange();

  const isFull =
    sel.startLineNumber === full.startLineNumber &&
    sel.startColumn === full.startColumn &&
    sel.endLineNumber === full.endLineNumber &&
    sel.endColumn === full.endColumn;

  if (!isFull) return;

  // check if folding exists
  const foldingController = monacoEditor.getContribution("editor.contrib.folding");
  foldingController?.foldingModelPromise.then((fm) => {
    if (!fm) return;
    const hasCollapsed = Array.from({ length: fm.regions.length }).some((_, i) => fm.regions.isCollapsed(i));
    if (hasCollapsed) {
      e.preventDefault();
      e.stopPropagation();

      const act = monacoEditor.getAction("editor.unfoldAll");
      if (act) {
        act.run().then(() => {
          const selection = monacoEditor.getSelection();
          if (selection && !selection.isEmpty()) {
            monacoEditor.executeEdits("deleteAfterUnfold", [
              {
                range: selection,
                text: "", // delete
              },
            ]);
          }
        });
      }
    }
  });
});

// font choices
const fontChoices = new Choices(fontFamilySelect, {
  searchEnabled: true,
  itemSelectText: "",
  shouldSort: false,
  allowHTML: true,
  position: "bottom",
});

// do not close menu when input box is clicked
fontChoices.input.element.addEventListener("mousedown", (e) => {
  e.stopPropagation();
});
fontChoices.input.element.addEventListener("click", (e) => {
  e.stopPropagation();
});

// scroll to bottom of settings menu whenever langSwitcher dropdown is shown
function scrollToBottomOfSettingsMenu() {
  requestAnimationFrame(() => {
    settingsMenu.scrollTop = settingsMenu.scrollHeight;
    requestAnimationFrame(() => {
      settingsMenu.scrollTop = settingsMenu.scrollHeight;
    });
  });
}

// scroll to selected item on top of menu list
function scrollToSelectedOption(choicesInstance) {
  const container = choicesInstance.containerOuter.element;
  container.querySelectorAll(".choices__item.is-highlighted").forEach((el) => el.classList.remove("is-highlighted"));

  const selectedOption = container.querySelector(".choices__item.is-selected");
  if (selectedOption) {
    selectedOption.scrollIntoView({
      behavior: "auto",
      block: "start",
    });
    requestAnimationFrame(() => {
      selectedOption.classList.add("is-highlighted");
    });
  }
}

// scroll fontFamilySelect to top of settingsMenu when its dropdown is not fully inside it
function adjustDropdownScroll() {
  requestAnimationFrame(() => {
    const dropdown = document.querySelector(".font-select-row .choices__list--dropdown");
    if (!dropdown || !fontSelectRow) return;

    const settingsRect = settingsMenu.getBoundingClientRect();
    const dropdownRect = dropdown.getBoundingClientRect();

    const overflowsBottom = dropdownRect.bottom > settingsRect.bottom;
    const overflowsTop = dropdownRect.top < settingsRect.top;

    if (overflowsBottom || overflowsTop) {
      const scrollTargetY = fontSelectRow.offsetTop;
      settingsMenu.scrollTop = scrollTargetY;
      requestAnimationFrame(() => {
        settingsMenu.scrollTop = scrollTargetY;
      });
    }
  });
}

function onDropdownShown(event) {
  const target = event.target;

  // === Font Selector ===
  if (target === fontFamilySelect) {
    scrollToSelectedOption(fontChoices);

    if (scrollLocked) {
      scrollAdjustQueue.push(adjustDropdownScroll);
    } else {
      adjustDropdownScroll();
    }
  }

  // === Language Selector ===
  else if (target === langSwitcher) {
    scrollToSelectedOption(langChoices);

    if (scrollLocked) {
      scrollAdjustQueue.push(scrollToBottomOfSettingsMenu);
    } else {
      scrollToBottomOfSettingsMenu();
    }
  }
}
fontFamilySelect.addEventListener("showDropdown", onDropdownShown);
langSwitcher.addEventListener("showDropdown", onDropdownShown);

// make style tag has font styles set to each class
function injectFontPreviewStyles(fontList) {
  const style = document.createElement("style");
  document.head.appendChild(style);

  const cssLines = fontList.map((fontName) => {
    const safeClass = fontName
      .trim()
      .replace(/\s+/g, "-")
      .toLowerCase()
      .replace(/[^a-z0-9\-_]/gi, "");
    const fontCSS = `"${fontName}", 'Figtree', sans-serif`;

    return `
      .choices__list--dropdown .font-preview-${safeClass} {
        font-family: ${fontCSS};
      }
    `;
  });

  style.textContent = cssLines.join("\n");
}

// get font using font-list and apply on launch
window.electronAPI.getFonts().then((fonts) => {
  const bundledFonts = ["Iosevka", "Migu 1M", "Figtree"];
  const cleanedFonts = fonts.map((f) => f.trim().replace(/^"|"$/g, ""));

  bundledFonts.forEach((font) => {
    if (!cleanedFonts.includes(font)) cleanedFonts.push(font);
  });

  const sortedFonts = cleanedFonts.sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));

  // create style tag
  injectFontPreviewStyles(sortedFonts);

  // apply to choices by adding class
  fontChoices.setChoices(
    sortedFonts.map((fontName) => {
      const safeClass = fontName
        .trim()
        .replace(/\s+/g, "-")
        .toLowerCase()
        .replace(/[^a-z0-9\-_]/gi, "");
      return {
        value: fontName,
        label: `<span class="font-preview-${safeClass}">${fontName}</span>`,
        html: true,
      };
    }),
    "value",
    "label",
    true,
  );

  fontChoices.setChoiceByValue(selectedFontFamily);
  applyFontToMonaco();
});

// apply font on change
fontFamilySelect.addEventListener("change", () => {
  selectedFontFamily = fontChoices.getValue(true);
  localStorage.setItem("selectedFontFamily", selectedFontFamily);
  console.log(selectedFontFamily);
  applyFontToMonaco();
});

function applyFontToMonaco() {
  const cssFont = getCSSVar("--editor-font");
  let cleanFontFamily = selectedFontFamily.replace(/^"|"$/g, "");

  const finalFont = cssFont && cssFont.trim() ? cssFont : `"${cleanFontFamily}", "Migu 1M", monospace`;

  monacoEditor.updateOptions({
    fontFamily: finalFont,
    ...WRAP_MEASURE_OPTIONS,
  });
  document.fonts.ready.then(() => {
    monaco.editor.remeasureFonts();
    monacoEditor.render(true);
  });
}

// font size button event
// font size on launch
fontSizeValue.textContent = persistentFontSize;
fontSize = persistentFontSize;

function updatePersistentFontSize(newSize) {
  if (newSize < 8) newSize = 8;
  if (newSize > 40) newSize = 40;

  persistentFontSize = newSize;
  fontSizeValue.textContent = persistentFontSize;
  localStorage.setItem(STORAGE_KEY, persistentFontSize);

  tabData.forEach((tab) => {
    tab.fontSize = persistentFontSize;
  });

  fontSize = persistentFontSize;
  monacoEditor.updateOptions({ fontSize });

  fontSizeDecrease.classList.toggle("disabled", persistentFontSize <= 8);
  fontSizeIncrease.classList.toggle("disabled", persistentFontSize >= 40);

  updateStatusBar?.();
}
updatePersistentFontSize(persistentFontSize);
fontSizeDecrease.addEventListener("click", () => {
  updatePersistentFontSize(persistentFontSize - 1);
});
fontSizeIncrease.addEventListener("click", () => {
  updatePersistentFontSize(persistentFontSize + 1);
});

// font settings reset button
document.querySelector("#settings-menu .font .reset").addEventListener("click", () => {
  // reset persistentFontSize, selectedFontFamily
  updatePersistentFontSize(16);
  selectedFontFamily = "Iosevka";
  localStorage.setItem("selectedFontFamily", selectedFontFamily);
  fontChoices.setChoiceByValue(selectedFontFamily);
  applyFontToMonaco();
});

// update font size with ctrl + mouse wheel / + - (temporary)
const updateFontSize = (newSize) => {
  fontSize = Math.max(8, Math.min(40, newSize));
  monacoEditor.updateOptions({ fontSize });
  if (currentTab) currentTab.fontSize = fontSize;
  updateStatusBar();
};

// Ctrl + mouse wheel
function attachCtrlWheelListener() {
  const editorDomNode = monacoEditor.getDomNode();
  if (!editorDomNode) return;
  const scrollElement = editorDomNode.querySelector(".monaco-scrollable-element");
  if (!scrollElement) return;

  // remove last listner
  if (wheelListener) {
    scrollElement.removeEventListener("wheel", wheelListener);
  }

  wheelListener = (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      updateFontSize(fontSize + (e.deltaY < 0 ? 1 : -1));
    }
  };

  scrollElement.addEventListener("wheel", wheelListener, { passive: false });
}

// Ctrl + + / -
window.addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.metaKey) {
    if (e.key === "=" || e.key === "+") {
      e.preventDefault();
      updateFontSize(fontSize + 1);
    } else if (e.key === "-") {
      e.preventDefault();
      updateFontSize(fontSize - 1);
    } else if (e.key === "0") {
      e.preventDefault();
      updateFontSize(persistentFontSize); // reset with ctrl + 0
    }
  }
});

// editor settings
function applySettings() {
  monacoEditor.updateOptions({
    renderLineHighlight: settings.lineHighlight ? "line" : "none",
    lineNumbers: settings.lineNumbers ? "on" : "off",
    minimap: {
      enabled: settings.minimap,
    },
    folding: settings.folding,
  });
  editor.style.marginLeft = settings.lineNumbers ? "20px" : "0px";

  document.querySelector("#line-highlight .checkmark").style.display = settings.lineHighlight ? "inline-block" : "none";
  document.querySelector("#line-num .checkmark").style.display = settings.lineNumbers ? "inline-block" : "none";
  document
    .querySelector("#minimap .checkmark")
    ?.style?.setProperty("display", settings.minimap ? "inline-block" : "none");
  document.querySelector("#toggleSyntaxHighlight .checkmark").style.display = settings.syntaxHighlight
    ? "inline-block"
    : "none";
  document.querySelector("#toggleFolding .checkmark").style.display = settings.folding ? "inline-block" : "none";
  document.querySelector("#toggleKuromoji .checkmark").style.display = settings.kuromojiEnabled
    ? "inline-block"
    : "none";

  // status bar visibility
  const statusBar = document.getElementById("status-bar");
  const checkmark = document.querySelector("#toggleStatusBar .checkmark");
  if (settings.statusBarVisible) {
    statusBar.style.display = "flex";
    checkmark.style.display = "inline-block";
    editor.style.height = "calc(100vh - 35px - 25px - var(--window-top-safe-area))";
    settingsMenu.style.height = "calc(100vh - 35px - 25px - var(--window-top-safe-area))";
  } else {
    statusBar.style.display = "none";
    checkmark.style.display = "none";
    editor.style.height = "calc(100vh - 35px - var(--window-top-safe-area))";
    settingsMenu.style.height = "calc(100vh - 35px - var(--window-top-safe-area))";
  }

  if (monacoEditor) {
    setTimeout(() => monacoEditor.layout(), 0);
  }
}

function toggleSetting(key) {
  settings[key] = !settings[key];
  localStorage.setItem("editorSettings", JSON.stringify(settings));
  applySettings();
}
applySettings();

document.getElementById("line-highlight").onclick = () => toggleSetting("lineHighlight");
document.getElementById("line-num").onclick = () => toggleSetting("lineNumbers");
document.getElementById("minimap").onclick = () => toggleSetting("minimap");
document.getElementById("toggleSyntaxHighlight").onclick = () => {
  toggleSetting("syntaxHighlight");
  monaco.editor.defineTheme("custom-theme", createCustomTheme());
  monaco.editor.setTheme("custom-theme");
  applyDecorations();
};
document.getElementById("toggleFolding").onclick = () => toggleSetting("folding");
document.getElementById("toggleStatusBar").onclick = () => toggleSetting("statusBarVisible");
document.getElementById("toggleKuromoji").onclick = () => {
  toggleSetting("kuromojiEnabled");
  setKuromojiEnabled(settings.kuromojiEnabled);
};

// editor settings reset button
document.querySelector("#settings-menu #settingsLayout .reset").addEventListener("click", () => {
  // reset settings, tabSize
  Object.assign(settings, defaultSettings);
  localStorage.setItem("editorSettings", JSON.stringify(settings));

  tabSize = 4;
  localStorage.setItem("tabSize", tabSize);

  applySettings();
  updateTabSize(tabSize);
});

// tab size button event
// tab size on launch
tabSizeValue.textContent = tabSize;
monacoEditor.updateOptions({ tabSize });

function updateTabSize(newSize) {
  tabSize = Math.min(10, Math.max(1, newSize));
  tabSizeValue.textContent = tabSize;
  localStorage.setItem("tabSize", tabSize);
  monacoEditor.updateOptions({ tabSize });

  tabSizeDecrease.classList.toggle("disabled", tabSize <= 1);
  tabSizeIncrease.classList.toggle("disabled", tabSize >= 10);

  updateStatusBar?.();
}
updateTabSize(tabSize);
tabSizeDecrease.addEventListener("click", () => updateTabSize(tabSize - 1));
tabSizeIncrease.addEventListener("click", () => updateTabSize(tabSize + 1));

// open custom theme folder button
document.getElementById("openThemeFolder").addEventListener("click", async () => {
  try {
    const userDataPath = await window.electronAPI.getUserDataPath();
    const themeFolderPath = `${userDataPath}/themes`;
    await window.electronAPI.openPath(themeFolderPath);
    console.log("themes path opened:", themeFolderPath);
  } catch (err) {
    console.error("Failed to open path:", err);
  }
});

// initial editor theme
monaco.editor.setTheme("custom-theme");

// update ln & col
monacoEditor.onDidChangeCursorPosition(() => {
  updateStatusBar();
});
monacoEditor.onDidChangeCursorSelection(() => {
  updateStatusBar();
});

// call Find from menu
window.triggerFind = function () {
  monacoEditor.getAction("actions.find").run();
};
document.getElementById("triggerFindBtn").addEventListener("click", triggerFind);

// call Replace from menu
window.triggerReplace = function () {
  monacoEditor.getAction("editor.action.startFindReplaceAction").run();
};
document.getElementById("triggerReplaceBtn").addEventListener("click", triggerReplace);

// call Go to Line from menu
window.triggerGoToLine = function () {
  monacoEditor?.focus();
  monacoEditor.getAction("editor.action.gotoLine").run();
};
document.getElementById("triggerGoToLineBtn").addEventListener("click", triggerGoToLine);

// call Go to Symbol from menu
window.triggerGoToSymbol = function () {
  monacoEditor?.focus();
  monacoEditor.getAction("editor.action.quickOutline").run();
};
document.getElementById("triggerGoToSymbolBtn").addEventListener("click", triggerGoToSymbol);

// call Command Palette from menu
window.triggerShowCommands = function () {
  monacoEditor?.focus();
  monacoEditor.trigger("keyboard", "editor.action.quickCommand", {});
};
document.getElementById("triggerShowCommandsBtn").addEventListener("click", triggerShowCommands);

// initial tab create
createTab();
switchTab(tabData[0]);
setTimeout(() => monacoEditor?.focus(), 0);

// menu button
menuButton.onclick = (e) => {
  e.stopPropagation();
  customContextMenu.style.display = "none";
  tabContextMenu.style.display = "none";
  rightClickedTab = null;
  const isOpen = menu.style.display === "block";
  menu.style.display = isOpen ? "none" : "block";
  menuButton.style.pointerEvents = isOpen ? "auto" : "none";
};

// close menu & context menu on outside click
document.addEventListener("mousedown", (e) => {
  if (e.target.closest(".choices")) return;
  if (!customContextMenu.contains(e.target)) {
    customContextMenu.style.display = "none";
  }
  if (!tabContextMenu.contains(e.target)) {
    tabContextMenu.style.display = "none";
    rightClickedTab = null;
  }
  if (!menu.contains(e.target) && !themeMenu.contains(e.target) && !recentMenu.contains(e.target)) {
    menu.style.display = "none";
    themeMenu.style.display = "none";
    recentMenu.style.display = "none";
    menuButton.style.pointerEvents = "auto";
  }
});

// close menu & context menu on button click
document.addEventListener("click", (e) => {
  const button = e.target.closest("button");

  // context menu
  if (customContextMenu.contains(e.target) && button) {
    customContextMenu.style.display = "none";
  }
  if (tabContextMenu.contains(e.target) && button) {
    tabContextMenu.style.display = "none";
    rightClickedTab = null;
  }

  // themeMenu & menu (except for cetain buttons)
  if (menu.contains(e.target) && button && !excludedIds.includes(button.id)) {
    menu.style.display = "none";
    menuButton.style.pointerEvents = "auto";
  }

  // recentMenu menu
  if (recentMenu.contains(e.target) && button) {
    recentMenu.style.display = "none";
    menu.style.display = "none";
    menuButton.style.pointerEvents = "auto";
  }
});

// close menu & context menu on right click
document.addEventListener("contextmenu", (e) => {
  const button = e.target.closest("button");
  const isExcluded = button && excludedIds.includes(button.id);
  const insideTheme = themeMenu.contains(e.target);

  if (!isExcluded && !insideTheme) {
    menu.style.display = "none";
    themeMenu.style.display = "none";
    recentMenu.style.display = "none";
    menuButton.style.pointerEvents = "auto";
  }
});

// update theme & recent menu y position
function updateMenuPositions() {
  const changeBtnRect = changeThemeBtn.getBoundingClientRect();
  const recentBtnRect = openRecentBtn.getBoundingClientRect();

  const topTheme = changeBtnRect.top - 5;
  const topRecent = recentBtnRect.top - 5;

  themeMenu.style.top = `${topTheme}px`;
  themeMenu.style.maxHeight = `${window.innerHeight - topTheme}px`;

  recentMenu.style.top = `${topRecent}px`;
  recentMenu.style.maxHeight = `${window.innerHeight - topRecent}px`;
}
window.addEventListener("resize", () => {
  updateMenuPositions();
  updateTabsCompactClass();

  // update editor padding
  const editorHeight = editor.clientHeight;
  monacoEditor.updateOptions({
    padding: {
      top: 12,
      bottom: editor.clientHeight / 2,
    },
  });
});
window.addEventListener("wheel", updateMenuPositions, { passive: true });

// recent menu display
openRecentBtn.addEventListener("mouseenter", () => {
  populateRecentMenu();
  const recent = JSON.parse(localStorage.getItem("recentFiles") || "[]");
  if (recent.length > 0) {
    recentMenu.style.display = "inline-block";
    updateMenuPositions();
  }
});
openRecentBtn.addEventListener("mouseleave", () => {
  setTimeout(() => {
    if (!recentMenu.matches(":hover") && !openRecentBtn.matches(":hover")) {
      recentMenu.style.display = "none";
    }
  }, 100);
});
recentMenu.addEventListener("mouseleave", () => {
  setTimeout(() => {
    if (!recentMenu.matches(":hover") && !openRecentBtn.matches(":hover")) {
      recentMenu.style.display = "none";
    }
  }, 100);
});

// theme menu display
changeThemeBtn.addEventListener("mouseenter", () => {
  themeMenu.style.display = "block";
  updateMenuPositions();
});
changeThemeBtn.addEventListener("mouseleave", () => {
  setTimeout(() => {
    if (!themeMenu.matches(":hover") && !changeThemeBtn.matches(":hover")) {
      themeMenu.style.display = "none";
    }
  }, 100);
});
themeMenu.addEventListener("mouseleave", () => {
  setTimeout(() => {
    if (!themeMenu.matches(":hover") && !changeThemeBtn.matches(":hover")) {
      themeMenu.style.display = "none";
    }
  }, 100);
});

async function applyCustomThemeCSS(themeName) {
  const themes = await window.electronAPI.getCustomThemes();
  const filePath = themes[themeName];

  if (currentWatchedCssFile && currentWatchedCssFile !== filePath) {
    window.electronAPI.unwatchCssFile(currentWatchedCssFile);
  }

  if (filePath) {
    try {
      const cssContent = await window.electronAPI.readCssFile(filePath);
      if (cssContent) {
        const existingStyle = document.getElementById("custom-theme-style");
        if (existingStyle) existingStyle.remove();

        const styleTag = document.createElement("style");
        styleTag.id = "custom-theme-style";
        styleTag.textContent = cssContent;
        document.head.appendChild(styleTag);

        currentWatchedCssFile = filePath;
        window.electronAPI.watchCssFile(filePath); // start watching file

        return true;
      }
    } catch (error) {
      console.error("Failed to apply custom theme:", error);
    }
  }

  console.log("Theme not found:", themeName);
  return false;
}

async function applyTheme(theme) {
  const themes = await window.electronAPI.getCustomThemes();
  const root = document.documentElement;

  // set to dark if custom theme file doesn't exist
  if (!["dark", "onyx", "ash"].includes(theme) && !themes[theme]) {
    theme = "dark";
    currentTheme = "dark";
    localStorage.setItem("theme", theme);
  }

  // override with custom theme if selected
  if (!["dark", "onyx", "ash"].includes(theme)) {
    // Set default fallback colors (dark) for custom themes. hence !important is required in css.
    root.style.setProperty("--color1", "#121214");
    root.style.setProperty("--color2", "#1a1a1e");
    root.style.setProperty("--color3", "#242429");
    const success = await applyCustomThemeCSS(theme);
    if (!success) {
      return;
    }
  } else {
    // delete style tag
    const existingStyle = document.getElementById("custom-theme-style");
    if (existingStyle) {
      existingStyle.remove();
    }
  }

  if (theme === "dark") {
    root.style.setProperty("--color1", "#121214");
    root.style.setProperty("--color2", "#1a1a1e");
    root.style.setProperty("--color3", "#242429");
  } else if (theme === "onyx") {
    root.style.setProperty("--color1", "#000000");
    root.style.setProperty("--color2", "#0c0c0e");
    root.style.setProperty("--color3", "#18181a");
  } else if (theme === "ash") {
    root.style.setProperty("--color1", "#232428");
    root.style.setProperty("--color2", "#292b31");
    root.style.setProperty("--color3", "#36393f");
  }

  monaco.editor.defineTheme("custom-theme", createCustomTheme());
  monaco.editor.setTheme("custom-theme");
}

// theme button click & update button checkmark
function updateActiveButton() {
  const allThemeButtons = themeMenu.querySelectorAll("button[data-theme]");
  allThemeButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-theme") === currentTheme);
  });
}

// theme button click event
function attachThemeButtonEvents() {
  const allThemeButtons = themeMenu.querySelectorAll("button[data-theme]");
  allThemeButtons.forEach((btn) => {
    btn.removeEventListener("click", handleThemeButtonClick);
    btn.addEventListener("click", handleThemeButtonClick);
  });
}

async function handleThemeButtonClick(event) {
  const theme = event.currentTarget.getAttribute("data-theme");
  currentTheme = theme;
  localStorage.setItem("theme", theme);
  await applyTheme(theme);
  applyFontToMonaco();
  updateActiveButton();
}

// load custom theme and add to menu
async function addCustomThemesToMenu() {
  const customThemes = await window.electronAPI.getCustomThemes();
  const themeNames = Object.keys(customThemes);

  if (themeNames.length > 0) {
    const hr = document.createElement("div");
    hr.className = "hr";
    themeMenu.appendChild(hr);

    themeNames.forEach((themeName) => {
      // snake-case -> "Title Case"
      const displayName = themeName
        .replace(/[-_/]+/g, " ")
        .split(" ")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(" ");

      const button = document.createElement("button");
      button.dataset.theme = themeName;
      button.innerHTML = `<span>${displayName}</span>
            <svg
              class="checkmark"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 10.23 7.15"
              style="width: 13px; height: 13px; stroke: #fff; fill: none"
            >
              <polyline
                points=".5 3.58 3.58 6.65 9.73 .5"
                style="fill: none; stroke: #fff; stroke-linecap: round; stroke-linejoin: round"
              />
            </svg>`;
      themeMenu.appendChild(button);
    });

    attachThemeButtonEvents();
    updateActiveButton();
  }
}

await applyTheme(currentTheme);
await addCustomThemesToMenu(); // load custom theme first
updateActiveButton();
attachThemeButtonEvents();

// apply css file update
window.electronAPI.onCssFileUpdated(async (path) => {
  if (currentWatchedCssFile === path && currentTheme) {
    console.log("Detected CSS update, reapplying theme...");
    await applyTheme(currentTheme);
    applyFontToMonaco();
  }
});

document.getElementById("openFileBtn").addEventListener("click", openFile);
document.getElementById("saveFileBtn").addEventListener("click", saveFile);
document.getElementById("saveAsFileBtn").addEventListener("click", saveAsFile);

// print button
// document.getElementById("print-button").addEventListener("click", () => {
//   const content = monacoEditor.getValue();
//   const fontFamily = monacoEditor.getRawOptions().fontFamily || "Consolas";
//   window.electronAPI.printContent({ text: content, fontFamily });
// });

// about button
document.getElementById("aboutBtn").addEventListener("click", () => {
  confirmBox.style.display = "flex";
  about.style.display = "flex";
  isModalDisplayed = true;
});

document.getElementById("about-close").addEventListener("click", () => {
  confirmBox.style.display = "none";
  about.style.display = "none";
  isModalDisplayed = false;
  monacoEditor?.focus();
});

function stopDeviceShareCountdown() {
  if (deviceShareCountdownTimer) {
    clearInterval(deviceShareCountdownTimer);
    deviceShareCountdownTimer = null;
  }
}

function formatRemainingTime(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function updateDeviceShareRegenerateButton() {
  if (!deviceShareRegenerate) return;

  if (!deviceShareExpiresAt && !activeDeviceShareUrl) {
    deviceShareRegenerate.disabled = true;
    deviceShareRegenerate.textContent = i18next.t("deviceShare.regenerate");
    return;
  }

  const remainingMs = deviceShareExpiresAt ? deviceShareExpiresAt - Date.now() : 0;
  if (remainingMs > 0) {
    deviceShareRegenerate.disabled = true;
    deviceShareRegenerate.textContent = `${i18next.t("deviceShare.regenerate")} (${formatRemainingTime(remainingMs)})`;
    return;
  }

  stopDeviceShareCountdown();
  deviceShareRegenerate.disabled = false;
  deviceShareRegenerate.innerHTML = `${i18next.t("deviceShare.regenerate")} <span id="device-share-expired">(${i18next.t(
    "deviceShare.expired",
  )})</span>`;
}

async function syncDeviceShareStatus() {
  if (!activeDeviceShareUrl || deviceShareStatusSyncing) return;

  deviceShareStatusSyncing = true;
  try {
    const status = await window.electronAPI.getMobileShareStatus(activeDeviceShareUrl);
    if (!status?.exists || status.expired) {
      deviceShareExpiresAt = Date.now();
      updateDeviceShareRegenerateButton();
      return;
    }
    if (typeof status.expiresAt === "number" && status.expiresAt !== deviceShareExpiresAt) {
      deviceShareExpiresAt = status.expiresAt;
      updateDeviceShareRegenerateButton();
    }
  } finally {
    deviceShareStatusSyncing = false;
  }
}

function startDeviceShareCountdown(expiresAt) {
  deviceShareExpiresAt = expiresAt || null;
  stopDeviceShareCountdown();
  updateDeviceShareRegenerateButton();
  deviceShareCountdownTimer = setInterval(() => {
    updateDeviceShareRegenerateButton();
    syncDeviceShareStatus();
  }, 1000);
}

function resetDeviceShareCopyButton() {
  if (!deviceShareCopy) return;
  clearTimeout(deviceShareCopyResetTimer);
  deviceShareCopy.textContent = i18next.t("deviceShare.copyLink");
}

function setDeviceShareCopyButtonCopied() {
  if (!deviceShareCopy) return;
  clearTimeout(deviceShareCopyResetTimer);
  deviceShareCopy.textContent = i18next.t("deviceShare.copied");
  deviceShareCopyResetTimer = setTimeout(resetDeviceShareCopyButton, 1200);
}

function setDeviceShareLinkContentVisible(visible) {
  if (deviceShareQrWrap) deviceShareQrWrap.style.display = visible ? "flex" : "none";
  if (deviceShareUrlRow) deviceShareUrlRow.style.display = visible ? "flex" : "none";
}

function resetDeviceShareModal() {
  deviceShareQr.removeAttribute("src");
  deviceShareUrl.value = "";
  deviceShareError.style.display = "none";
  deviceShareError.textContent = "";
  deviceShareDescription.textContent = i18next.t("deviceShare.description");
  resetDeviceShareCopyButton();
  stopDeviceShareCountdown();
  deviceShareExpiresAt = null;
  deviceShareRegenerate.disabled = true;
  deviceShareRegenerate.textContent = i18next.t("deviceShare.regenerate");
  setDeviceShareLinkContentVisible(true);
}

function getDeviceShareErrorMessage(result) {
  if (result?.errorKey === "tooLarge") {
    return i18next.t("deviceShare.tooLarge", { maxMb: result.maxMb || 2 });
  }
  return i18next.t("deviceShare.createError");
}

async function closeDeviceShareModal() {
  confirmBox.style.display = "none";
  deviceShareModal.style.display = "none";
  isModalDisplayed = false;
  stopDeviceShareCountdown();
  deviceShareExpiresAt = null;

  if (activeDeviceShareUrl) {
    await window.electronAPI.revokeMobileShare(activeDeviceShareUrl);
    activeDeviceShareUrl = null;
  }

  monacoEditor?.focus();
}

async function createDeviceShareLink() {
  if (!monacoEditor || !currentTab) return;

  if (activeDeviceShareUrl) {
    await window.electronAPI.revokeMobileShare(activeDeviceShareUrl);
    activeDeviceShareUrl = null;
  }

  deviceShareDescription.textContent = i18next.t("deviceShare.preparing");
  setDeviceShareLinkContentVisible(false);
  deviceShareRegenerate.disabled = true;
  deviceShareRegenerate.textContent = i18next.t("deviceShare.regenerate");
  resetDeviceShareCopyButton();

  const title = currentTab.name || "Monapad Note";
  const text = monacoEditor.getModel() === currentTab.model ? monacoEditor.getValue() : currentTab.model.getValue();
  const result = await window.electronAPI.createMobileShare({
    title,
    text,
    labels: {
      copy: i18next.t("deviceShare.pageCopy"),
      copied: i18next.t("deviceShare.pageCopied"),
    },
  });

  if (!result?.success) {
    deviceShareDescription.textContent = "";
    deviceShareError.textContent = getDeviceShareErrorMessage(result);
    deviceShareError.style.display = "block";
    deviceShareRegenerate.disabled = false;
    deviceShareRegenerate.textContent = i18next.t("deviceShare.regenerate");
    return;
  }

  activeDeviceShareUrl = result.url;
  deviceShareUrl.value = result.url;
  deviceShareQr.src = await QRCode.toDataURL(result.url, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 220,
    color: {
      dark: getCSSVar("--editorText") || "#ffffff",
      light: getCSSVar("--color1") || "#000000",
    },
  });
  setDeviceShareLinkContentVisible(true);
  deviceShareDescription.textContent = i18next.t("deviceShare.description");
  startDeviceShareCountdown(result.expiresAt);
}

async function openDeviceShareModal() {
  if (!monacoEditor || !currentTab) return;
  if (!getCurrentEditorText().trim()) {
    updateDeviceShareButtonState();
    return;
  }

  confirmBox.style.display = "flex";
  deviceShareModal.style.display = "flex";
  isModalDisplayed = true;
  resetDeviceShareModal();
  await createDeviceShareLink();
}

deviceShareBtn?.addEventListener("click", openDeviceShareModal);
deviceShareClose?.addEventListener("click", closeDeviceShareModal);
deviceShareRegenerate?.addEventListener("click", async () => {
  if (deviceShareRegenerate.disabled) return;
  await createDeviceShareLink();
});
deviceShareCopy?.addEventListener("click", async () => {
  if (!deviceShareUrl.value) return;

  try {
    await navigator.clipboard.writeText(deviceShareUrl.value);
    setDeviceShareCopyButtonCopied();
  } catch (err) {
    deviceShareUrl.focus();
    deviceShareUrl.select();
  }
});

// window controls
document.getElementById("min-button").addEventListener("click", () => {
  window.electronAPI.minimizeWindow();
});

document.getElementById("max-button").addEventListener("click", () => {
  window.electronAPI.toggleMaximizeWindow();
});

document.getElementById("close-button").addEventListener("click", () => {
  attemptCloseWindow();
});

window.electronAPI.onAttemptCloseWindow(() => {
  attemptCloseWindow();
});

// add tab (+) button
addTabButton.onclick = () => {
  createTab();
  switchTab(tabData.at(-1));
};
// new tab button
newTabBtn.addEventListener("click", (e) => {
  e.preventDefault();
  createTab();
  switchTab(tabData.at(-1));
});

// tabs hover state
tabsContainer.addEventListener("mouseover", (e) => {
  tabAreaHovered = true;

  const hoveredTab = e.target.closest(".tab");
  if (hoveredTab) {
    const allTabs = tabs.querySelectorAll(".tab");
    isHoveringLastTab = hoveredTab === allTabs[allTabs.length - 1];
  } else {
    isHoveringLastTab = false;
  }
});
function handleTabsMouseLeave() {
  tabAreaHovered = false;
  isHoveringLastTab = false;
  fixedTabsWidth = null;
  tabs.style.maxWidth = "";
  updateTabsCompactClass();
}
function isMouseInsideTabsContainer() {
  const rect = tabsContainer.getBoundingClientRect();
  return mouseX >= rect.left && mouseX <= rect.right && mouseY >= rect.top && mouseY <= rect.bottom;
}
tabsContainer.addEventListener("mouseleave", () => {
  handleTabsMouseLeave();
});
// detect if cursor is in tabsContainer even without cursor movement
document.addEventListener("mousemove", (e) => {
  mouseX = e.clientX;
  mouseY = e.clientY;
  if (tabAreaHovered && !isMouseInsideTabsContainer()) handleTabsMouseLeave();
});

// new window button
newWindowBtn.addEventListener("click", () => {
  window.electronAPI.createNewWindow();
});

// file drag & drop
window.addEventListener("dragenter", (e) => {
  if (isModalDisplayed) return;
  if (!e.dataTransfer.types.includes("Files")) return;

  dragCounter++;
  if (dragCounter === 1) {
    fileDropBox.style.display = "flex";
    fileDrop.style.display = "flex";
  }
});

window.addEventListener("dragleave", (e) => {
  if (isModalDisplayed) return;
  dragCounter = Math.max(0, dragCounter - 1);

  if (dragCounter === 0) {
    fileDropBox.style.display = "none";
    fileDrop.style.display = "none";
  }
});

window.addEventListener("drop", async (e) => {
  e.preventDefault();
  dragCounter = 0;

  fileDropBox.style.display = "none";
  fileDrop.style.display = "none";

  if (!e.dataTransfer.files.length || isModalDisplayed) return;

  const file = e.dataTransfer.files[0];
  const filePath = await window.electronAPI.getPathForFile(file);
  if (filePath) await loadFileByPath(filePath);
});

window.addEventListener("dragover", (e) => {
  e.preventDefault(); // prevent default to allow drop
  if (isModalDisplayed) {
    e.dataTransfer.dropEffect = "none";
  } else {
    e.dataTransfer.dropEffect = "copy";
  }
});

// update status bar
function updateStatusBar() {
  if (!monacoEditor) return;

  const position = monacoEditor.getPosition();
  const model = monacoEditor.getModel();
  const eol = model.getEOL();
  const currentEncoding = "UTF-8";

  let lineEnding = "Unknown";
  if (eol === "\r\n") {
    lineEnding = "CRLF";
  } else if (eol === "\n") {
    lineEnding = "LF";
  } else if (eol === "\r") {
    lineEnding = "CR";
  }

  const selections = monacoEditor.getSelections();
  let totalSelectedLength = 0;
  if (selections && selections.length > 0) {
    totalSelectedLength = selections.reduce((sum, sel) => sum + model.getValueLengthInRange(sel), 0);
  }

  const selectionText =
    totalSelectedLength > 0 ? ` ${i18next.t("statusBar.selection", { count: totalSelectedLength })}` : "";

  statusLeft.textContent = currentFilePath;
  statusLeft.title = currentFilePath;
  lineColEl.textContent = `${i18next.t("statusBar.line")} ${position.lineNumber}, ${i18next.t("statusBar.col")} ${
    position.column
  }${selectionText}`;
  zoomLevelEl.textContent = `${Math.round((fontSize / persistentFontSize) * 100)}%`;
  lineEndingEl.textContent = lineEnding;
  encodingEl.textContent = currentEncoding;
  encodingEl.title = i18next.t("statusBar.encodingTooltip");
}

// drag & drop indicator when dragging tab to another window
function showDropIndicator(clientX) {
  if (!dropIndicator) return;
  const tabsRect = tabs.getBoundingClientRect();
  const tabElements = Array.from(tabs.children).filter((el) => el.classList.contains("tab") && el !== draggingTab);
  if (!tabElements.length) {
    dropIndicator.style.left = "0px";
    dropIndicator.style.display = "block";
    return;
  }

  const relativeX = clientX - tabsRect.left;
  let left = 0;

  for (let i = 0; i < tabElements.length; i++) {
    const rect = tabElements[i].getBoundingClientRect();
    const targetLeft = rect.left - tabsRect.left;
    const targetRight = rect.right - tabsRect.left;
    const midpoint = targetLeft + rect.width / 2;

    if (relativeX <= midpoint) {
      left = targetLeft;
      break;
    }

    if (i === tabElements.length - 1 || relativeX <= tabElements[i + 1].getBoundingClientRect().left - tabsRect.left) {
      left = targetRight;
      break;
    }
  }

  left = Math.max(0, Math.min(left, tabsRect.width));
  const indicatorWidth = dropIndicator.offsetWidth || 2;
  const centeredLeft = left - indicatorWidth / 2;
  dropIndicator.style.left = `${centeredLeft}px`;
  dropIndicator.style.display = "block";
}

function hideDropIndicator() {
  if (!dropIndicator) return;
  dropIndicator.style.display = "none";
}

function showExternalDropIndicator(screenX, screenY) {
  if (!dropIndicator) return;
  if (typeof screenX !== "number" || typeof screenY !== "number") {
    hideDropIndicator();
    return;
  }

  const localClientX = screenX - window.screenX;
  const tabsRect = tabs.getBoundingClientRect();

  if (localClientX <= tabsRect.left) {
    showDropIndicator(tabsRect.left);
    return;
  }

  if (localClientX >= tabsRect.right) {
    showDropIndicator(tabsRect.right);
    return;
  }

  showDropIndicator(localClientX);
}

function resetExternalPreviewTargetWindow() {
  if (externalPreviewTargetWindowId !== null) {
    window.electronAPI.clearPreviewTabDrop(externalPreviewTargetWindowId);
    externalPreviewTargetWindowId = null;
  }
}

function setExternalPreviewTargetWindow(targetWindowId, dropScreenX, dropScreenY) {
  if (externalPreviewTargetWindowId !== null && externalPreviewTargetWindowId !== targetWindowId) {
    window.electronAPI.clearPreviewTabDrop(externalPreviewTargetWindowId);
    externalPreviewTargetWindowId = null;
  }

  if (targetWindowId && targetWindowId !== myWindowId) {
    externalPreviewTargetWindowId = targetWindowId;
    if (dropScreenX !== lastPreviewX || dropScreenY !== lastPreviewY) {
      lastPreviewX = dropScreenX;
      lastPreviewY = dropScreenY;
      window.electronAPI.previewTabDrop(targetWindowId, { dropScreenX, dropScreenY });
    }
    return;
  }

  lastPreviewX = null;
  lastPreviewY = null;
  resetExternalPreviewTargetWindow();
}

// tab dragging
function enableTabDragging(tab, data) {
  tab.addEventListener("mousedown", async (e) => {
    if (e.button !== 0 || e.target.closest(".close") || draggingTab) return;
    // console.log("📌mousedown: start");
    isHandlingMouseDown = true;
    tabPendingDeferredMouseUp = tab;
    dragStartClientPos = { x: e.clientX, y: e.clientY };
    switchTab(data);
    draggingTab = tab;
    // console.log("📌mousedown: draggingTab set");
    draggingTabData = data;
    dragIndex = tabData.indexOf(data);
    wasOnlyTab = tabData.length === 1;
    startX = e.clientX;
    currentX = 0;
    tab.style.transition = "none";
    tab.style.position = "relative";
    windowBoundsCache = await window.electronAPI.getMyBounds();
    cachedToolbarRect = toolbar.getBoundingClientRect();
    externalCancelDragging = handleCancelDraggingByShortcut;
    // console.log("📌mousedown: adding eventlistener...");
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    // console.log("📌mousedown: eventlistener added");
    isHandlingMouseDown = false;

    // defered: only process mouseup that occur while processing current tab
    if (deferredOnMouseUp && tabPendingDeferredMouseUp === tab) {
      console.log("📌deferred onMouseUp fired after mousedown end");
      deferredOnMouseUp = false;
      tabPendingDeferredMouseUp = null;
      const e = deferredMouseUpEvent;
      deferredMouseUpEvent = null;
      onMouseUp(e);
    }
  });

  function shouldCheckWindow() {
    const now = performance.now();
    if (now - lastWindowCheck > 100) {
      lastWindowCheck = now;
      return true;
    }
    return false;
  }

  function onMouseMove(e) {
    if (!draggingTab) return;

    const mouseX = e.clientX;
    const mouseY = e.clientY;
    const toolbarRect = cachedToolbarRect;
    const isOutsideToolbar =
      mouseX < toolbarRect.left ||
      mouseX > toolbarRect.right - windowControls.offsetWidth ||
      mouseY < toolbarRect.top ||
      mouseY > toolbarRect.bottom + toolbarRect.height / 2;

    if (isOutsideToolbar) {
      hideDropIndicator();
      tabs.classList.remove("dragging");
      draggingTab.style.opacity = "0.5";
      overlayWindowVisible = true;
      window.electronAPI.createCursorWindow();

      if (shouldCheckWindow()) {
        const isWarn = draggingTabData.isWarned;
        window.electronAPI.getWindowIdAt({ x: e.screenX, y: e.screenY }).then(async (targetWindowId) => {
          if (!windowBoundsCache) {
            setExternalPreviewTargetWindow(null);
            return;
          }
          const myBounds = windowBoundsCache;
          const isInMyWindow =
            e.screenX >= myBounds.x &&
            e.screenX <= myBounds.x + myBounds.width &&
            e.screenY >= myBounds.y &&
            e.screenY <= myBounds.y + myBounds.height;

          let isTargetMinimized = false;
          if (targetWindowId) {
            isTargetMinimized = await window.electronAPI.isWindowMinimized(targetWindowId);
          }

          let state = "";
          if (isWarn) {
            state = "forbidden";
          } else if (targetWindowId && targetWindowId !== myWindowId && !isInMyWindow && !isTargetMinimized) {
            state = "move";
          } else if (wasOnlyTab) {
            state = "forbidden";
          } else {
            state = "new";
          }

          if (state === "move") {
            setExternalPreviewTargetWindow(targetWindowId, e.screenX, e.screenY);
          } else {
            setExternalPreviewTargetWindow(null);
          }
          window.electronAPI.setCursorWindowState(state);
        });
      }

      window.electronAPI.moveCursorWindow(e.screenX, e.screenY);
      return;
    } else {
      tabs.classList.add("dragging");
      draggingTab.style.opacity = "1";
      overlayWindowVisible = false;
      window.electronAPI.destroyCursorWindow();
      setExternalPreviewTargetWindow(null);
      hideDropIndicator();

      currentX = mouseX - startX;
      draggingTab.style.transform = `translateX(${currentX}px)`;
    }

    const tabsArray = Array.from(tabs.children).filter((el) => el.classList.contains("tab"));
    const currentRect = draggingTab.getBoundingClientRect();
    for (let i = 0; i < tabsArray.length; i++) {
      const targetTab = tabsArray[i];
      if (targetTab === draggingTab) continue;

      const targetRect = targetTab.getBoundingClientRect();
      const targetCenter = targetRect.left + targetRect.width / 2;

      if (currentX > 0 && currentRect.right > targetCenter && i > dragIndex) {
        const oldLeft = currentRect.left;

        tabs.insertBefore(draggingTab, targetTab.nextSibling);
        monacoEditor.getDomNode()?.blur();
        switchTab(currentTab);

        const newRect = draggingTab.getBoundingClientRect();
        const deltaX = oldLeft - newRect.left;

        currentX += deltaX;
        draggingTab.style.transform = `translateX(${currentX}px)`;

        [tabData[dragIndex], tabData[i]] = [tabData[i], tabData[dragIndex]];
        scheduleAllUnsavedTabAutosaves();
        dragIndex = i;
        startX = e.clientX - currentX;

        break;
      } else if (currentX < 0 && currentRect.left < targetCenter && i < dragIndex) {
        const oldLeft = currentRect.left;

        tabs.insertBefore(draggingTab, targetTab);
        monacoEditor.getDomNode()?.blur();
        switchTab(currentTab);

        const newRect = draggingTab.getBoundingClientRect();
        const deltaX = oldLeft - newRect.left;

        currentX += deltaX;
        draggingTab.style.transform = `translateX(${currentX}px)`;

        [tabData[dragIndex], tabData[i]] = [tabData[i], tabData[dragIndex]];
        scheduleAllUnsavedTabAutosaves();
        dragIndex = i;
        startX = e.clientX - currentX;

        break;
      }
    }
  }

  async function onMouseUp(e) {
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
    // console.log("🗑️mouseup: eventlistener removed");

    if (tabPendingDeferredMouseUp === tab) {
      tabPendingDeferredMouseUp = null;
      deferredOnMouseUp = false;
      deferredMouseUpEvent = null;
    }

    if (!draggingTab || !e) {
      console.warn("⚠️ onMouseUp called with invalid state", draggingTab, e);
      dragStartClientPos = null;
      externalCancelDragging = null;
      return;
    }

    const isWarn = draggingTabData.isWarned;
    const releasedTabData = tabData.find((t) => t.element === draggingTab);

    draggingTab.style.transition = "";
    draggingTab.style.transform = "";
    draggingTab.style.position = "";
    draggingTab.style.pointerEvents = "";
    draggingTab.style.opacity = "1";
    tabs.classList.remove("dragging");

    if (overlayWindowVisible) {
      overlayWindowVisible = false;
      window.electronAPI.destroyCursorWindow();
    }

    resetExternalPreviewTargetWindow();
    hideDropIndicator();
    draggingTab = null;
    draggingTabData = null;
    cachedToolbarRect = null;
    externalCancelDragging = null;
    dragIndex = -1;

    if (isWarn || !releasedTabData || !windowBoundsCache) {
      dragStartClientPos = null;
      return;
    }

    const mouseX = e.clientX;
    const mouseY = e.clientY;
    const toolbarRect = toolbar.getBoundingClientRect();
    const isOutsideToolbar =
      mouseX < toolbarRect.left ||
      mouseX > toolbarRect.right - windowControls.offsetWidth ||
      mouseY < toolbarRect.top ||
      mouseY > toolbarRect.bottom + toolbarRect.height / 2;

    const myBounds = windowBoundsCache;
    const isInMyWindow =
      e.screenX >= myBounds.x &&
      e.screenX <= myBounds.x + myBounds.width &&
      e.screenY >= myBounds.y &&
      e.screenY <= myBounds.y + myBounds.height;

    windowBoundsCache = null;

    // get window id from cursor position
    window.electronAPI
      .getWindowIdAt({ x: e.screenX, y: e.screenY })
      .then(async (targetWindowId) => {
        if (targetWindowId && targetWindowId !== myWindowId && !isInMyWindow) {
          await writeTabAutosave(releasedTabData);
          // send tab to window on drop
          const tabInfo = {
            name: releasedTabData.name,
            content: releasedTabData.model.getValue(),
            path: releasedTabData.path,
            isFileSaved: releasedTabData.isFileSaved,
            originalContent: releasedTabData.originalContent,
            fontSize: releasedTabData.fontSize,
            wordWrap: releasedTabData.wordWrap,
            isMarkdown: releasedTabData.isMarkdown,
            draftId: releasedTabData.draftId,
            hasReloadButton: releasedTabData.element?.classList.contains("has-reload-button"),
          };
          window.electronAPI
            .sendTabToWindow(targetWindowId, {
              tabInfo,
              dropScreenX: e.screenX,
              dropScreenY: e.screenY,
            })
            .then(() => {
              window.electronAPI.focusWindow(targetWindowId);
            });

          removeTabAndAdjustUI(releasedTabData);

          if (wasOnlyTab) {
            attemptCloseWindow();
          }
        } else if (isOutsideToolbar) {
          if (wasOnlyTab) return;
          const position = dragStartClientPos
            ? {
                x: e.screenX - dragStartClientPos.x,
                y: e.screenY - dragStartClientPos.y,
              }
            : { x: e.screenX, y: e.screenY };
          openTabInNewWindow(releasedTabData, position);
        }
      })
      .finally(() => {
        dragStartClientPos = null;
      });
  }

  // terminate dragging due to shortcut key pressing
  function handleCancelDraggingByShortcut() {
    // Prevent duplicate execution (function was already called once)
    if (!externalCancelDragging) return;

    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);

    if (!draggingTab) {
      dragStartClientPos = null;
      externalCancelDragging = null;
      return;
    }

    draggingTab.style.transition = "";
    draggingTab.style.transform = "";
    draggingTab.style.position = "";
    draggingTab.style.pointerEvents = "";
    draggingTab.style.opacity = "1";
    tabs.classList.remove("dragging");

    if (overlayWindowVisible) {
      overlayWindowVisible = false;
      window.electronAPI.destroyCursorWindow();
    }

    draggingTab = null;
    draggingTabData = null;
    cachedToolbarRect = null;
    dragStartClientPos = null;
    externalCancelDragging = null;
    dragIndex = -1;
  }
}

document.addEventListener("mouseup", (e) => {
  if (isHandlingMouseDown) {
    console.log("🚩mouseup came during mousedown; deferring onMouseUp");
    deferredOnMouseUp = true;
    deferredMouseUpEvent = {
      clientX: e.clientX,
      clientY: e.clientY,
      screenX: e.screenX,
      screenY: e.screenY,
      button: e.button,
    };
  }
});

async function openTabInNewWindow(targetTabData, position) {
  if (!targetTabData) return;
  await writeTabAutosave(targetTabData);

  const tabInfo = {
    name: targetTabData.name,
    content: targetTabData.model.getValue(),
    path: targetTabData.path,
    isFileSaved: targetTabData.isFileSaved,
    originalContent: targetTabData.originalContent,
    fontSize: targetTabData.fontSize,
    wordWrap: targetTabData.wordWrap,
    isMarkdown: targetTabData.isMarkdown,
    draftId: targetTabData.draftId,
    hasReloadButton: targetTabData.element?.classList.contains("has-reload-button"),
  };

  await window.electronAPI.createNewWindowWithTab(tabInfo, position);
  removeTabAndAdjustUI(targetTabData);
}

function removeTabAndAdjustUI(targetTabData) {
  const index = tabData.indexOf(targetTabData);
  if (index === -1) return;

  clearAutosaveTimer(targetTabData);
  tabs.removeChild(targetTabData.element);
  tabData.splice(index, 1);
  scheduleAllUnsavedTabAutosaves();

  const isActive = targetTabData.element.classList.contains("active");

  if (!isActive) {
    // Update prev-active tab if necessary
    const currentActive = tabData.find((t) => t.element.classList.contains("active"));
    if (currentActive) {
      document.querySelectorAll(".tab").forEach((tab) => tab.classList.remove("prev-active"));
      const prev = currentActive.element.previousElementSibling;
      if (prev && prev.classList.contains("tab")) {
        prev.classList.add("prev-active");
      }
    }
    return;
  }

  // Active tab was removed → switch or create
  if (tabData.length) {
    const newIndex = index === tabData.length ? Math.max(index - 1, 0) : index;
    switchTab(tabData[newIndex]);
    setTimeout(() => monacoEditor?.focus(), 0);
  } else {
    currentTab = null;
    createTab();
    fixedTabsWidth = null;
    tabs.style.maxWidth = "";
    switchTab(tabData[0]);
    setTimeout(() => monacoEditor?.focus(), 0);
  }
}

// add compact class to tabs when tab width is less than 50 px
function updateTabsCompactClass() {
  const tabElements = tabs.querySelectorAll(".tab");
  if (tabElements.length === 0) return;

  const tabWidth = tabElements[0].offsetWidth;
  tabs.classList.toggle("compact", tabWidth <= 60);
}

// create tab
function createTab(name, content = "", path = null, insertIndex = null) {
  if (!name) name = `${i18next.t("file.untitled")}.txt`;

  // reset tabs max width
  fixedTabsWidth = null;
  tabs.style.maxWidth = "";

  const tab = document.createElement("div");
  tab.className = "tab";

  const nameSpan = document.createElement("span");
  nameSpan.className = "name";
  nameSpan.textContent = name;
  nameSpan.title = name;

  const close = document.createElement("span");
  close.className = "close";

  const unsavedDot = document.createElement("div");
  unsavedDot.className = "unsaved-dot";

  const closeSvg = document.createElement("div");
  closeSvg.className = "close-svg";
  closeSvg.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8.74 8.74" width="10" height="10">
            <line x1="8.24" y1=".5" x2=".5" y2="8.24"
                  fill="none" stroke="#fff" stroke-linecap="round" stroke-miterlimit="10"/>
            <line x1="8.24" y1="8.24" x2=".5" y2=".5"
                  fill="none" stroke="#fff" stroke-linecap="round" stroke-miterlimit="10"/>
          </svg>
        `;

  close.appendChild(unsavedDot);
  close.appendChild(closeSvg);

  tab.appendChild(nameSpan);
  tab.appendChild(close);

  const model = monaco.editor.createModel(content, "monapad");
  const data = {
    name,
    content,
    path,
    element: tab,
    fontSize: persistentFontSize,
    isFileSaved: true,
    model: model,
    viewState: null,
    isMarkdown: false,
    isWarned: false,
    originalContent: content,
    _lastExternalContent: path ? content : null,
    draftId: path ? null : createAutosaveId(),
  };

  if (insertIndex !== null && insertIndex >= 0 && insertIndex < tabData.length) {
    const referenceTab = tabData[insertIndex].element;
    tabs.insertBefore(tab, referenceTab);
    tabData.splice(insertIndex, 0, data);
  } else {
    tabs.appendChild(tab);
    tabData.push(data);
  }

  close.onclick = async (e) => {
    e.stopPropagation();

    if (tabAreaHovered && !isHoveringLastTab) {
      // set current tabs width - current tab width to tabs max width before closing tab
      const currentTabsWidth = tabs.offsetWidth;
      const tabWidth = tab.offsetWidth;
      fixedTabsWidth = currentTabsWidth - tabWidth;
      tabs.style.maxWidth = fixedTabsWidth + "px";
    } else if (tabAreaHovered && isHoveringLastTab) {
      // keep max width when last tab is closed
      fixedTabsWidth = tabs.offsetWidth;
      tabs.style.maxWidth = fixedTabsWidth + "px";
    }

    await attemptCloseTab(data);

    // update tabscontainer client rect
    if (tabAreaHovered && !isMouseInsideTabsContainer()) {
      handleTabsMouseLeave();
    }
  };

  tab.onclick = (e) => {
    if (e.target.closest(".close")) return;
    switchTab(data);
  };

  // tab middle click
  tab.addEventListener("auxclick", async (e) => {
    if (e.button === 1) {
      e.preventDefault();
      e.stopPropagation();

      if (tabAreaHovered && !isHoveringLastTab) {
        const currentTabsWidth = tabs.offsetWidth;
        const tabWidth = tab.offsetWidth;
        fixedTabsWidth = currentTabsWidth - tabWidth;
        tabs.style.maxWidth = fixedTabsWidth + "px";
      } else if (tabAreaHovered && isHoveringLastTab) {
        fixedTabsWidth = tabs.offsetWidth;
        tabs.style.maxWidth = fixedTabsWidth + "px";
      }

      await attemptCloseTab(data);

      if (tabAreaHovered && !isMouseInsideTabsContainer()) {
        handleTabsMouseLeave();
      }
    }
  });

  // tab drag handler
  enableTabDragging(tab, data);

  updateTabsCompactClass();

  return data;
}

// close tab
async function attemptCloseTab(data) {
  return new Promise(async (resolve) => {
    const tab = data.element;

    if (!data.isFileSaved) {
      const message = confirmSave.querySelector("p");

      message.textContent = i18next.t("modal.saveChanges", { name: data.name });
      confirmBox.style.display = "flex";
      confirmSave.style.display = "flex";
      isModalDisplayed = true;

      const actuallyCloseTab = async (options = {}) => {
        const tabIndex = tabData.indexOf(data);
        if (data.path) {
          addToRecentlyClosedFiles(data.path, tabIndex);
          if (options.discardUnsaved) await window.electronAPI.discardFileAutosaveBackup(data.path);
        } else if (options.discardUnsaved && data.model?.getValue()?.trim()) {
          const trash = await window.electronAPI.moveAutosaveDraftToTrash({
            draftId: data.draftId,
            name: data.name,
            ownerId: myWindowId,
            content: data.model.getValue(),
          });
          if (trash?.success) addToRecentlyClosedTrash(trash.trashId, trash.name || data.name, tabIndex);
        } else {
          await deleteTabAutosave(data);
        }
        clearAutosaveTimer(data);

        const index = tabData.indexOf(data);
        tabs.removeChild(tab);
        updateTabsCompactClass();
        if (data.model) data.model.dispose();
        tabData = tabData.filter((t) => t !== data);
        scheduleAllUnsavedTabAutosaves();
        syncRecentlyClosedFilesState();

        if (tab.classList.contains("active")) {
          if (tabData.length) {
            const newIndex = index === tabData.length ? Math.max(index - 1, 0) : index;
            switchTab(tabData[newIndex]);
            setTimeout(() => monacoEditor?.focus(), 0);
          } else {
            currentTab = null;
            createTab();

            // reset max width when last tab is closed
            fixedTabsWidth = null;
            tabs.style.maxWidth = "";

            switchTab(tabData[0]);
            setTimeout(() => monacoEditor?.focus(), 0);
          }
        } else {
          const currentActive = tabData.find((t) => t.element.classList.contains("active"));
          if (currentActive) {
            document.querySelectorAll(".tab").forEach((tab) => {
              tab.classList.remove("prev-active");
            });

            const prev = currentActive.element.previousElementSibling;
            if (prev && prev.classList.contains("tab")) {
              prev.classList.add("prev-active");
            }

            setTimeout(() => monacoEditor?.focus(), 0);
          }
        }
      };

      const removeListeners = () => {
        yesBtn.removeEventListener("click", onSave);
        noBtn.removeEventListener("click", onDontSave);
        cancelBtn.removeEventListener("click", onCancel);
        window.removeEventListener("keydown", onKeyDown);
      };

      const onSave = async () => {
        confirmBox.style.display = "none";
        confirmSave.style.display = "none";
        isModalDisplayed = false;
        switchTab(data);
        let success = false;

        if (data.path) {
          success = await saveFile();
        } else {
          success = await saveAsFile();
        }

        if (success !== false) {
          await actuallyCloseTab();
          resolve("closed");
        } else {
          resolve("cancelled");
        }

        removeListeners();
      };

      const onDontSave = async () => {
        confirmBox.style.display = "none";
        confirmSave.style.display = "none";
        isModalDisplayed = false;
        await actuallyCloseTab({ discardUnsaved: true });
        removeListeners();
        resolve("closed");
      };

      const onCancel = () => {
        confirmBox.style.display = "none";
        confirmSave.style.display = "none";
        isModalDisplayed = false;
        removeListeners();
        monacoEditor?.focus();
        resolve("cancelled");
      };

      const onKeyDown = (e) => {
        if (!isModalDisplayed) return;
        const key = (e.key || "").toLowerCase();
        if (e.code === "KeyS" || key === "s") {
          e.preventDefault();
          onSave();
        } else if (e.code === "KeyD" || key === "d") {
          e.preventDefault();
          onDontSave();
        } else if (e.code === "KeyC" || e.code === "Escape" || key === "c" || key === "escape") {
          e.preventDefault();
          onCancel();
        }
      };

      yesBtn.addEventListener("click", onSave);
      noBtn.addEventListener("click", onDontSave);
      cancelBtn.addEventListener("click", onCancel);
      window.addEventListener("keydown", onKeyDown);
      return;
    }

    // close immediately when save is not required
    if (data.path) {
      const tabIndex = tabData.indexOf(data);
      addToRecentlyClosedFiles(data.path, tabIndex);
    }
    clearAutosaveTimer(data);
    if (!data.path) {
      await deleteTabAutosave(data);
    }
    const index = tabData.indexOf(data);
    tabs.removeChild(tab);
    updateTabsCompactClass();
    if (data.model) data.model.dispose();
    tabData = tabData.filter((t) => t !== data);
    scheduleAllUnsavedTabAutosaves();
    syncRecentlyClosedFilesState();

    if (tab.classList.contains("active")) {
      if (tabData.length) {
        const newIndex = index === tabData.length ? Math.max(index - 1, 0) : index;
        switchTab(tabData[newIndex]);
        setTimeout(() => monacoEditor?.focus(), 0);
      } else {
        currentTab = null;
        createTab();

        // reset max width when last tab is closed
        fixedTabsWidth = null;
        tabs.style.maxWidth = "";

        switchTab(tabData[0]);
        setTimeout(() => monacoEditor?.focus(), 0);
      }
    } else {
      const currentActive = tabData.find((t) => t.element.classList.contains("active"));
      if (currentActive) {
        document.querySelectorAll(".tab").forEach((tab) => {
          tab.classList.remove("prev-active");
        });

        const prev = currentActive.element.previousElementSibling;
        if (prev && prev.classList.contains("tab")) {
          prev.classList.add("prev-active");
        }

        setTimeout(() => monacoEditor?.focus(), 0);
      }
    }

    resolve("closed");
  });
}

// add to recently closed files
function addToRecentlyClosedFiles(filePath, tabIndex) {
  if (!filePath) return;

  recentlyClosedFiles = recentlyClosedFiles.filter((item) => item.type !== "file" || item.path !== filePath);
  recentlyClosedFiles.unshift({ type: "file", path: filePath, index: tabIndex });
  if (recentlyClosedFiles.length > 10) {
    recentlyClosedFiles = recentlyClosedFiles.slice(0, 10);
  }

  updateReopenClosedTabButtonState();
}

function addToRecentlyClosedTrash(trashId, name, tabIndex) {
  if (!trashId) return;

  recentlyClosedFiles = recentlyClosedFiles.filter((item) => item.type !== "trash" || item.trashId !== trashId);
  recentlyClosedFiles.unshift({ type: "trash", trashId, name, index: tabIndex });
  if (recentlyClosedFiles.length > 10) {
    recentlyClosedFiles = recentlyClosedFiles.slice(0, 10);
  }

  updateReopenClosedTabButtonState();
}

function updateReopenClosedTabButtonState() {
  const reopenBtn = document.querySelector('[data-action="reopenClosedTab"]');
  reopenBtn?.classList.toggle("disabled", recentlyClosedFiles.length === 0);
}

function syncRecentlyClosedFilesState() {
  const openPaths = new Set(tabData.map((tab) => tab.path).filter(Boolean));
  const seenPaths = new Set();
  const seenTrashIds = new Set();

  recentlyClosedFiles = recentlyClosedFiles.filter((item) => {
    if (item?.type === "trash") {
      if (!item.trashId || seenTrashIds.has(item.trashId)) return false;
      seenTrashIds.add(item.trashId);
      return true;
    }

    const filePath = item?.path;
    if (!filePath || openPaths.has(filePath) || seenPaths.has(filePath)) return false;
    seenPaths.add(filePath);
    return true;
  });

  updateReopenClosedTabButtonState();
}

// open recently closed files
async function reopenRecentlyClosedFile() {
  syncRecentlyClosedFilesState();

  while (recentlyClosedFiles.length > 0) {
    const item = recentlyClosedFiles.shift();
    const { path: filePath, index: originalIndex } = item;

    if (item.type === "trash") {
      const trash = await window.electronAPI.readAutosaveTrash(item.trashId);
      if (!trash?.exists) continue;

      let restoredTab = null;
      if (tabData.length === 1 && !tabData[0].path && !tabData[0].model?.getValue()?.trim()) {
        restoredTab = tabData[0];
        await deleteTabAutosave(restoredTab);
        restoredTab.name = trash.name;
        restoredTab.draftId = createAutosaveId();
        restoredTab.isWarned = false;
        restoredTab.isMarkdown = false;

        const nameSpan = restoredTab.element.querySelector(".name");
        if (nameSpan) {
          nameSpan.textContent = restoredTab.name;
          nameSpan.title = restoredTab.name;
          nameSpan.classList.remove("warn");
        }
        reloadButton(restoredTab, null, "remove");
      } else {
        const restoreIndex = Math.min(originalIndex, tabData.length);
        restoredTab = createTab(trash.name, "", null, restoreIndex);
        restoredTab.draftId = createAutosaveId();
      }

      applyRestoredAutosaveContent(restoredTab, "", trash.content);
      switchTab(restoredTab);
      scheduleTabAutosave(restoredTab, restoredTab.content);
      await window.electronAPI.deleteAutosaveTrash(item.trashId);
      syncRecentlyClosedFilesState();
      return;
    }

    const existingTab = tabData.find((tab) => tab.path === filePath);

    if (existingTab) {
      switchTab(existingTab);
      continue;
    }

    const exists = await window.electronAPI.fileExists(filePath);
    if (!exists) continue;

    const restoreIndex = Math.min(originalIndex, tabData.length);
    await loadFileByPath(filePath, restoreIndex);
    syncRecentlyClosedFilesState();
    return;
  }

  updateReopenClosedTabButtonState();
}

// close window
async function attemptCloseWindow() {
  const hasUnsavedTabs = tabData.some((tab) => !tab.isFileSaved);
  if (!hasUnsavedTabs) {
    await cleanupSavedTabAutosaves();
    window.electronAPI.closeWindow();
    return;
  }

  confirmBox.style.display = "flex";
  confirmWindow.style.display = "flex";
  isModalDisplayed = true;

  const removeListeners = () => {
    saveAllBtn.removeEventListener("click", onSaveAll);
    discardAllBtn.removeEventListener("click", onDiscardAll);
    cancelAllBtn.removeEventListener("click", onCancelAll);
    window.removeEventListener("keydown", onKeyDown);
  };

  const closeConfirm = () => {
    confirmBox.style.display = "none";
    confirmWindow.style.display = "none";
    isModalDisplayed = false;
  };

  const onSaveAll = async () => {
    closeConfirm();

    const cancelledTabs = [];

    const allTabs = [...tabData];

    for (const tab of allTabs) {
      switchTab(tab);

      if (!tab.isFileSaved) {
        let success = false;
        if (tab.path) {
          success = await saveFile();
        } else {
          success = await saveAsFile();
        }

        if (success === false) {
          cancelledTabs.push(tab); // keep canceled tab
          continue;
        }
      }

      // close saved tab
      const index = tabData.indexOf(tab);
      if (index !== -1) {
        await deleteTabAutosave(tab);
        tabs.removeChild(tab.element);
        tabData.splice(index, 1);
      }
    }

    removeListeners();

    if (cancelledTabs.length === 0) {
      window.electronAPI.closeWindow();
    } else {
      switchTab(cancelledTabs[0]);
      setTimeout(() => monacoEditor?.focus(), 0);
    }
  };

  const onDiscardAll = async () => {
    closeConfirm();
    removeListeners();

    // close all tabs
    for (const tab of [...tabData]) {
      clearAutosaveTimer(tab);
      if (!tab.isFileSaved) {
        if (tab.path) {
          await window.electronAPI.discardFileAutosaveBackup(tab.path);
        } else if (tab.model?.getValue()?.trim()) {
          await window.electronAPI.moveAutosaveDraftToTrash({
            draftId: tab.draftId,
            name: tab.name,
            ownerId: myWindowId,
            content: tab.model.getValue(),
          });
        } else {
          await deleteTabAutosave(tab);
        }
      } else {
        await deleteTabAutosave(tab);
      }
      tabs.removeChild(tab.element);
    }
    tabData = [];
    window.electronAPI.closeWindow();
  };

  const onCancelAll = () => {
    closeConfirm();
    removeListeners();
    monacoEditor?.focus();
  };

  const onKeyDown = (e) => {
    if (!isModalDisplayed) return;
    const key = (e.key || "").toLowerCase();
    if (e.code === "KeyS" || key === "s") {
      e.preventDefault();
      onSaveAll();
    } else if (e.code === "KeyD" || key === "d") {
      e.preventDefault();
      onDiscardAll();
    } else if (e.code === "KeyC" || e.code === "Escape" || key === "c" || key === "escape") {
      e.preventDefault();
      onCancelAll();
    }
  };

  saveAllBtn.addEventListener("click", onSaveAll);
  discardAllBtn.addEventListener("click", onDiscardAll);
  cancelAllBtn.addEventListener("click", onCancelAll);
  window.addEventListener("keydown", onKeyDown);
}

// switch tab
function switchTab(data) {
  if (!monacoEditor) return;

  const currentActive = tabData.find((t) => t.element.classList.contains("active"));
  if (currentActive) {
    // save tab data
    currentActive.content = currentActive.model.getValue();
    currentActive.viewState = monacoEditor.saveViewState();
    currentActive.fontSize = fontSize;
    currentActive.wordWrap = isWordWrapOn;
  }

  // load tab-specific settings
  fontSize = data.fontSize || persistentFontSize; // font size for each tabs
  isWordWrapOn = data.wordWrap ?? true;
  isMarkdownOn = data.isMarkdown ?? false;

  const editorOptions = {
    fontSize,
    wordWrap: isWordWrapOn ? "on" : "off",
    ...WRAP_MEASURE_OPTIONS,
    scrollbar: {
      horizontal: isWordWrapOn ? "hidden" : "auto",
    },
    autoClosingBrackets: isMarkdownOn ? "always" : "never",
  };

  // apply settings before model switch
  monacoEditor.updateOptions(editorOptions);
  monaco.editor.setModelLanguage(data.model, isMarkdownOn ? "markdown" : "monapad");

  // update tab style
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.classList.remove("active", "prev-active");
  });

  const newActive = data.element;
  newActive.classList.add("active");

  const prev = newActive.previousElementSibling;
  if (prev && prev.classList.contains("tab")) {
    prev.classList.add("prev-active");
  }

  // update tab content
  monacoEditor.setModel(data.model);
  attachCtrlWheelListener();

  currentTab = data;
  currentFilePath = data.path || data.name;
  updateDeviceShareButtonState();

  // restore selection, scroll position
  if (data.viewState) monacoEditor.restoreViewState(data.viewState);
  monacoEditor.focus();

  updateStatusBar();

  // re-apply tab-specific settings after model switch
  monacoEditor.updateOptions(editorOptions);
  monaco.editor.setModelLanguage(data.model, isMarkdownOn ? "markdown" : "monapad");

  // update WordWrap toggle button UI
  const wrapBtn = document.querySelector('button[data-action="wordWrap"] svg.checkmark');
  if (wrapBtn) wrapBtn.style.display = isWordWrapOn ? "inline-block" : "none";

  // update Markdown toggle button UI
  const mdBtn = document.querySelector('button[data-action="toggleMarkdown"] svg.checkmark');
  if (mdBtn) mdBtn.style.display = isMarkdownOn ? "inline-block" : "none";

  applyDecorations();

  // stop watching previously active file
  if (currentWatchedFilePath && currentWatchedFilePath !== data.path) {
    window.electronAPI.unwatchFile(currentWatchedFilePath);
    currentWatchedFilePath = null;
  }

  // watch active file
  if (data.path && currentWatchedFilePath !== data.path) {
    window.electronAPI.watchFile(data.path);
    currentWatchedFilePath = data.path;
  }
}

// detect when file is moved, deleted, or renamed
window.electronAPI.onFileChanged((event, { filePath, eventType }) => {
  const targetTab = tabData.find((tab) => tab.path === filePath);
  if (!targetTab) return;

  if (eventType === "rename") {
    // if file is not found
    targetTab.isWarned = true;
    targetTab.element.querySelector(".name").classList.add("warn");
    reloadButton(targetTab, null, "remove");
    if (tabContextMenu.style.display !== "none") updateTabContextMenuState(tabContextMenu, targetTab);
  } else if (eventType === "change") {
    // if file is changed
    targetTab.isWarned = false;
    targetTab.element.querySelector(".name").classList.remove("warn");
    handleFileChange(targetTab, filePath);
    if (tabContextMenu.style.display !== "none") updateTabContextMenuState(tabContextMenu, targetTab);
  }
});

async function handleFileChange(targetTab, filePath) {
  let content = null;
  try {
    content = await window.electronAPI.readFile(filePath);
  } catch (e) {
    content = null;
  }

  if (content === null) {
    // line-through name if file is not found. remove reload button
    targetTab.isWarned = true;
    targetTab.element.querySelector(".name").classList.add("warn");
    reloadButton(targetTab, null, "remove");
    if (tabContextMenu.style.display !== "none") updateTabContextMenuState(tabContextMenu, targetTab);
    return;
  }

  // remove line-through if file is found
  targetTab.isWarned = false;
  targetTab.element.querySelector(".name").classList.remove("warn");
  if (tabContextMenu.style.display !== "none") updateTabContextMenuState(tabContextMenu, targetTab);

  // Ignore watcher noise if the on-disk content is unchanged from the last known disk snapshot.
  if (content === targetTab._lastExternalContent) {
    reloadButton(targetTab, null, "remove");
    return;
  }

  if (targetTab.isFileSaved && normalizeTextForModelComparison(content) === targetTab.originalContent) {
    reloadButton(targetTab, null, "remove");
    targetTab._lastExternalContent = content;
    return;
  }

  // if file modified externally, add reload button and let user to decide to update or not.
  if (targetTab !== currentTab) switchTab(targetTab);
  showMessage("file-modified");
  console.log("handleFileChange: file modified externally. showing reload button");
  reloadButton(targetTab, filePath, "add");
}

function applyFileContentToEditor(tab, content) {
  tab._lastExternalContent = content;
  tab.isFileSaved = true;

  if (tab !== currentTab) switchTab(tab);
  tab.viewState = monacoEditor.saveViewState();
  tab._ignoreUnsavedCheck = true;
  tab.model.setValue(content);
  const modelContent = tab.model.getValue();
  tab.content = modelContent;
  tab.originalContent = modelContent;

  monacoEditor.restoreViewState(tab.viewState);
  monacoEditor.focus();

  const close = tab.element.querySelector(".close");
  if (close) close.classList.remove("show-unsaved");

  updateStatusBar();
  applyDecorations();
  showMessage("file-updated");
  reloadButton(tab, null, "remove");
  console.log("handleFileChange: content updated");
}

function reloadButton(tab, filePath, mode) {
  const existing = tab.element.querySelector(".reload-button");

  if (mode === "remove") {
    if (existing) existing.remove();
    tab.element.classList.remove("has-reload-button");
    return;
  }

  if (mode === "add") {
    if (existing) return; // already exists

    const button = document.createElement("button");
    button.classList.add("reload-button");
    tab.element.classList.add("has-reload-button");
    button.title = i18next.t("message.ReloadButtonTooltip");
    button.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 17 17">
        <path fill="none" stroke="#fff" stroke-linecap="round" stroke-linejoin="round"
          d="M16.43,9.54c-.57,4.38-4.59,7.47-8.97,6.89C3.08,15.86,0,11.84.57,7.46.99,4.22,3.34,1.57,6.51.76c3.9-1,7.94,1.01,9.43,4.75"/>
        <path fill="none" stroke="#fff" stroke-linecap="round" stroke-linejoin="round"
          d="M16.5.5v5h-5"/>
      </svg>
    `;
    button.onclick = async () => {
      const content = await window.electronAPI.readFile(filePath);
      if (tab !== currentTab) switchTab(tab);
      applyFileContentToEditor(tab, content);
      reloadButton(tab, null, "remove");
    };

    const nameEl = tab.element.querySelector(".name");
    if (nameEl) nameEl.insertBefore(button, nameEl.firstChild);
  }
}

// open file
async function openFile() {
  const filePath = await window.electronAPI.openFileDialog();
  if (!filePath) return;
  await loadFileByPath(filePath);
}

// file load hadling
async function loadFileByPath(filePath, insertIndex = null) {
  if (!filePath) return;

  const existingTab = tabData.find((tab) => tab.path === filePath);
  if (existingTab) {
    switchTab(existingTab);
    syncRecentlyClosedFilesState();
    showMessage("file-opened");
    return;
  }

  const content = await window.electronAPI.readFile(filePath);
  if (content === null || content === undefined) {
    console.error("Failed to read file.");
    return;
  }

  const fileName = filePath.split(/[/\\]/).pop();
  const autosaveBackup = await window.electronAPI.getFileAutosaveBackup(filePath);
  const shouldRestoreAutosave = autosaveBackup?.exists ? await confirmAutosaveRestore(fileName) : false;

  if (autosaveBackup?.exists && !shouldRestoreAutosave) {
    await window.electronAPI.discardFileAutosaveBackup(filePath);
  }

  const isMarkdownFile = /\.(md|markdown)$/i.test(filePath);

  if (tabData.length === 1) {
    const singleTab = tabData[0];
    const currentContent = monacoEditor ? monacoEditor.getValue() : "";
    if (!singleTab.content.trim() && !currentContent.trim()) {
      await deleteTabAutosave(singleTab);
      singleTab.name = fileName;
      singleTab._lastExternalContent = content;
      singleTab.path = filePath;
      singleTab.draftId = null;
      singleTab.isFileSaved = true;
      singleTab.isMarkdown = isMarkdownFile;
      singleTab.isWarned = false;

      const nameSpan = singleTab.element.querySelector(".name");
      if (nameSpan) {
        nameSpan.textContent = singleTab.name;
        nameSpan.title = singleTab.name;
        nameSpan.classList.remove("warn");
      }

      const close = singleTab.element.querySelector(".close");
      if (close) close.classList.remove("show-unsaved");

      reloadButton(singleTab, null, "remove");
      singleTab._ignoreUnsavedCheck = true;
      singleTab.model.setValue(content);
      const modelContent = singleTab.model.getValue();
      singleTab.content = modelContent;
      singleTab.originalContent = modelContent;
      singleTab.isFileSaved = true;
      if (shouldRestoreAutosave) {
        applyRestoredAutosaveContent(singleTab, modelContent, autosaveBackup.content);
        showMessage("autosave-restored");
      }
      switchTab(singleTab);
      updateRecentFiles(filePath);
      syncRecentlyClosedFilesState();
      return;
    }
  }

  // use insertIndex if it's set, otherwise set next to active tab
  let targetIndex = insertIndex;
  if (targetIndex === null) {
    const activeIndex = tabData.findIndex((t) => t.element.classList.contains("active"));
    targetIndex = Math.min(tabData.length, activeIndex + 1);
  } else {
    targetIndex = Math.max(0, targetIndex);
  }

  const newTabData = createTab(fileName, content, filePath, targetIndex);
  const modelContent = newTabData.model.getValue();
  newTabData.content = modelContent;
  newTabData.originalContent = modelContent;
  newTabData._lastExternalContent = content;
  newTabData.draftId = null;
  newTabData.isFileSaved = true;
  newTabData.isMarkdown = isMarkdownFile;
  newTabData.isWarned = false;
  if (shouldRestoreAutosave) {
    applyRestoredAutosaveContent(newTabData, modelContent, autosaveBackup.content);
    showMessage("autosave-restored");
  }

  const newTabClose = newTabData.element.querySelector(".close");
  if (newTabClose) newTabClose.classList.toggle("show-unsaved", shouldRestoreAutosave);
  newTabData.element.querySelector(".name")?.classList.remove("warn");
  reloadButton(newTabData, null, "remove");

  switchTab(newTabData);
  updateRecentFiles(filePath);
  syncRecentlyClosedFilesState();
}

// recently opened file handler
function updateRecentFiles(filePath) {
  if (!filePath) return;
  let recent = JSON.parse(localStorage.getItem("recentFiles") || "[]");
  recent = recent.filter((p) => p !== filePath); // remove duplication
  recent.unshift(filePath);
  if (recent.length > 8) recent = recent.slice(0, 8);
  localStorage.setItem("recentFiles", JSON.stringify(recent));
  populateRecentMenu();
}

// update open recent menu
async function populateRecentMenu() {
  let recent = JSON.parse(localStorage.getItem("recentFiles") || "[]");

  // Compatible with old format: if string, convert to { path, exists }
  recent = recent
    .map((item) => {
      if (typeof item === "string") return { path: item, exists: true };
      if (typeof item === "object" && typeof item.path === "string") {
        return { path: item.path, exists: true };
      }
      return null;
    })
    .filter(Boolean); // Exclude null and undefined

  const seenPaths = new Set();
  recent = recent.filter((entry) => {
    if (seenPaths.has(entry.path)) return false;
    seenPaths.add(entry.path);
    return true;
  });

  // check file existance
  for (const entry of recent) {
    try {
      entry.exists = await window.electronAPI.fileExists(entry.path);
    } catch {
      entry.exists = false;
    }
  }

  // store existing files up to 8 & non existing files up to 8 (order maintained)
  const nextRecent = [];
  let validCount = 0;

  for (const entry of recent) {
    if (entry.exists) {
      if (validCount < 8) {
        nextRecent.push({ path: entry.path, exists: true });
        validCount++;
      }
    } else {
      nextRecent.push({ path: entry.path, exists: false });
    }
    if (nextRecent.length >= 16) break;
  }

  localStorage.setItem("recentFiles", JSON.stringify(nextRecent));

  // update menu with only existing files
  const displayEntries = nextRecent.filter((e) => e.exists).slice(0, 8);

  recentMenu.innerHTML = "";

  // disable button when no recently opened files
  if (displayEntries.length === 0) {
    openRecentBtn.classList.add("disabled");
    recentMenu.style.display = "none";
    return;
  }
  openRecentBtn.classList.remove("disabled");

  displayEntries.forEach(({ path }) => {
    const button = document.createElement("button");
    const span = document.createElement("span");
    span.textContent = path;

    button.appendChild(span);
    button.title = path;

    button.addEventListener("click", async () => {
      recentMenu.style.display = "none";
      console.log("Opening file:", path, typeof path);
      if (typeof path === "string") {
        await loadFileByPath(path);
      } else {
        console.warn("Invalid path value:", path);
      }
    });
    recentMenu.appendChild(button);
  });

  // clear buttons
  const hr = document.createElement("div");
  hr.className = "hr";
  recentMenu.appendChild(hr);

  const clearButton = document.createElement("button");
  clearButton.innerHTML = `<span>${i18next.t("menu.clearHistory")}</span>`;
  clearButton.className = "clear-recent-btn";
  clearButton.addEventListener("click", () => {
    localStorage.removeItem("recentFiles");
    populateRecentMenu();
  });
  recentMenu.appendChild(clearButton);
}
populateRecentMenu();

// save as
async function saveAsFile() {
  const active = tabData.find((t) => t.element.classList.contains("active"));
  if (!active || !monacoEditor) return;

  const content = monacoEditor.getValue();
  const previousDraftId = active.draftId;
  clearAutosaveTimer(active);
  const { filePath } = await window.electronAPI.showSaveDialog(active.name);
  if (!filePath) {
    scheduleTabAutosave(active, content);
    return false;
  }

  const result = await window.electronAPI.saveToFile(filePath, content);
  if (result.success) {
    active.path = filePath;
    active.name = filePath.split(/[\\/]/).pop();
    active.element.querySelector(".name").textContent = active.name;
    active.element.querySelector(".name").title = active.name;
    active.originalContent = content;
    active.isFileSaved = true;
    active._lastExternalContent = content;
    active.draftId = null;
    clearAutosaveTimer(active);
    if (previousDraftId) await window.electronAPI.deleteAutosaveDraft(previousDraftId);
    await window.electronAPI.discardFileAutosaveBackup(filePath);

    currentFilePath = filePath;
    updateStatusBar();

    const activeClose = active.element.querySelector(".close");
    if (activeClose) activeClose.classList.remove("show-unsaved");
    reloadButton(active, null, "remove");
    updateRecentFiles(filePath);
    showMessage("file-saved");
    switchTab(active);
    return true;
  } else {
    console.error("Failed to save file:", result.error);
    return false;
  }
}

// overwrite save
async function saveFile() {
  const active = tabData.find((t) => t.element.classList.contains("active"));
  console.log("Saving file path:", active?.path);
  if (!active || !monacoEditor) return false;

  // excute saveAsFile when no path
  if (!active.path) {
    return await saveAsFile();
  }

  if (active.isFileSaved && !active.isWarned) {
    console.log("No changes to save.");
    return true;
  }

  const content = monacoEditor.getValue();
  const result = await window.electronAPI.saveToFile(active.path, content);
  if (result.success) {
    console.log("File saved successfully");

    // udpate unsaved indicator when saved
    active.originalContent = content;
    active.isFileSaved = true;
    active._lastExternalContent = content;
    clearAutosaveTimer(active);
    await window.electronAPI.discardFileAutosaveBackup(active.path);

    const activeSaveClose = active.element.querySelector(".close");
    if (activeSaveClose) activeSaveClose.classList.remove("show-unsaved");
    reloadButton(active, null, "remove");
    showMessage("file-saved");
  } else {
    console.error("Failed to save file:", result.error);
    if (result.error.includes("EPERM")) {
      return await saveAsFile();
    }
  }
}

function hasUnsavedChanges(tab, content = null) {
  const nextContent = content ?? tab?.content ?? tab?.model?.getValue() ?? "";
  const savedContent = tab?.originalContent ?? "";
  return nextContent !== savedContent;
}

function syncTabSaveState(tab, content = null) {
  if (!tab) return false;

  const hasChanges = hasUnsavedChanges(tab, content);
  tab.isFileSaved = !hasChanges;
  if (!hasChanges) {
    deleteTabAutosave(tab);
  }

  const close = tab.element?.querySelector(".close");
  if (close) {
    close.classList.toggle("show-unsaved", hasChanges);
  }

  return hasChanges;
}

// file saved & file already opened message
const messageQueue = [];
let isShowingMessage = false;
let isWindowFocused = true; // default is focused

function showMessage(id) {
  const currentShowing = document.querySelector(".show");
  if (messageQueue.includes(id) || (currentShowing && currentShowing.id === id)) {
    return;
  }

  messageQueue.push(id);
  if (!isShowingMessage && isWindowFocused) {
    processQueue();
  }
}

function processQueue() {
  if (messageQueue.length === 0) {
    isShowingMessage = false;
    return;
  }
  if (!isWindowFocused) {
    isShowingMessage = false; // stop process when not focused
    return;
  }
  isShowingMessage = true;
  const id = messageQueue.shift();
  const el = document.getElementById(id);
  if (!el) {
    processQueue(); // go next when no element
    return;
  }
  el.classList.add("show");
  const duration = 1500;
  setTimeout(() => {
    el.classList.remove("show");
    processQueue();
  }, duration);
}

// get forcus state
window.electronAPI.onWindowFocus((focused) => {
  isWindowFocused = focused;
  if (focused && messageQueue.length > 0 && !isShowingMessage) {
    processQueue();
  }
});

restoreAutosaveDrafts();

// Tab context menu handler
document.addEventListener("contextmenu", async (e) => {
  const tabElement = e.target.closest(".tab");
  if (!tabElement) return;

  e.preventDefault();
  rightClickedTab = tabData.find((t) => t.element === tabElement);
  if (!rightClickedTab) return;

  syncRecentlyClosedFilesState();

  // update reopen closed tab button
  const validItems = [];
  for (const item of recentlyClosedFiles) {
    if (item?.type === "trash") {
      const trash = await window.electronAPI.readAutosaveTrash(item.trashId);
      if (trash?.exists) validItems.push(item);
      continue;
    }

    if (item?.path) {
      const exists = await window.electronAPI.fileExists(item.path);
      if (exists) validItems.push(item);
    }
  }
  if (validItems.length !== recentlyClosedFiles.length) {
    recentlyClosedFiles = validItems;
    updateReopenClosedTabButtonState();
  }

  // Hide editor context menu
  customContextMenu.style.display = "none";

  // Update copy & open path button
  updateTabContextMenuState(tabContextMenu, rightClickedTab);

  // menu position
  tabContextMenu.style.display = "block";
  tabContextMenu.style.visibility = "hidden";

  const menuWidth = tabContextMenu.offsetWidth;
  const menuHeight = tabContextMenu.offsetHeight;
  const pageWidth = window.innerWidth;
  const pageHeight = window.innerHeight;

  let left = e.pageX;
  let top = e.pageY;

  if (left + menuWidth > pageWidth) {
    left = Math.max(0, pageWidth - menuWidth);
  }
  if (top + menuHeight > pageHeight) {
    top = Math.max(0, pageHeight - menuHeight);
  }

  tabContextMenu.style.left = `${left}px`;
  tabContextMenu.style.top = `${top}px`;
  tabContextMenu.style.visibility = "visible";
  tabContextMenu.style.display = "flex";
});

// update copy & open path button based on path existance
function updateTabContextMenuState(menu, tab) {
  const copyPathBtn = menu.querySelector('[data-action="copyPath"]');
  const openPathBtn = menu.querySelector('[data-action="openPath"]');
  const openInNewWindowBtn = menu.querySelector('[data-action="openInNewWindow"]');

  const hasPath = tab && tab.path;
  const isWarn = tab.isWarned;

  if (copyPathBtn) copyPathBtn.classList.toggle("disabled", !hasPath || isWarn);
  if (openPathBtn) openPathBtn.classList.toggle("disabled", !hasPath || isWarn);
  if (openInNewWindowBtn) openInNewWindowBtn.classList.toggle("disabled", isWarn || tabData.length === 1);
}

// Close multiple tabs one by one (close others, close to the right & close saved)
async function closeTabsSequentially(tabsToClose) {
  if (tabsToClose.length === 0) return;

  for (const tabToClose of tabsToClose) {
    // Check if tab still exists (might have been closed already)
    if (tabData.includes(tabToClose)) {
      const closed = await attemptCloseTab(tabToClose);
      // If user cancelled, stop the process
      if (closed === "cancelled") {
        break;
      }
    }
  }
}

// Tab context menu click handler
tabContextMenu.addEventListener("click", async (e) => {
  const action = e.target.closest("button")?.dataset.action;
  if (!action || !rightClickedTab) return;

  const targetTab = rightClickedTab;

  tabContextMenu.style.display = "none";
  rightClickedTab = null;

  switch (action) {
    case "close":
      await attemptCloseTab(targetTab);
      break;

    case "closeOthers":
      const otherTabs = tabData.filter((t) => t !== targetTab);
      if (otherTabs.length > 0) {
        await closeTabsSequentially(otherTabs);
      }
      break;

    case "closeToRight":
      const rightClickedIndex = tabData.indexOf(targetTab);
      const tabsToRight = tabData.slice(rightClickedIndex + 1);
      if (tabsToRight.length > 0) {
        await closeTabsSequentially(tabsToRight);
      }
      break;

    case "closeSaved":
      const savedTabs = tabData.filter((t) => t.isFileSaved);
      if (savedTabs.length > 0) {
        await closeTabsSequentially(savedTabs);
      }
      break;

    case "copyPath":
      if (targetTab && targetTab.path) {
        try {
          await navigator.clipboard.writeText(targetTab.path);
        } catch (err) {
          console.error("Failed to copy path:", err);
        }
      }
      break;

    case "openPath":
      if (targetTab && targetTab.path) {
        try {
          await window.electronAPI.openPath(targetTab.path);
        } catch (err) {
          console.error("Failed to open path:", err);
        }
      }
      break;

    case "reopenClosedTab":
      await reopenRecentlyClosedFile();
      break;

    case "openInNewWindow":
      await openTabInNewWindow(targetTab);
      break;
  }
});

// editor context menu display & position handler
editor.addEventListener("contextmenu", (e) => {
  e.preventDefault();

  tabContextMenu.style.display = "none";
  rightClickedTab = null;

  customContextMenu.style.display = "block";
  customContextMenu.style.visibility = "hidden";

  const menuWidth = customContextMenu.offsetWidth;
  const menuHeight = customContextMenu.offsetHeight;
  const pageWidth = window.innerWidth;
  const pageHeight = window.innerHeight;

  let left = e.pageX;
  let top = e.pageY;

  // X
  if (left + menuWidth > pageWidth) {
    left = Math.max(0, pageWidth - menuWidth);
  }

  // Y
  if (top + menuHeight > pageHeight) {
    top = Math.max(35, pageHeight - menuHeight);
  } else {
    top = Math.max(35, top);
  }

  customContextMenu.style.left = `${left}px`;
  customContextMenu.style.top = `${top}px`;
  customContextMenu.style.visibility = "visible";
  customContextMenu.style.display = "flex";
});

// editor context menu click handler
customContextMenu.addEventListener("click", async (e) => {
  const actionElement = e.target.closest("[data-action]");
  if (!actionElement) {
    return;
  }
  const action = actionElement.dataset.action;
  if (!action) {
    return;
  }

  const model = monacoEditor.getModel();

  switch (action) {
    case "copy": {
      try {
        const selections = monacoEditor.getSelections();
        const model = monacoEditor.getModel();
        let textToCopy = "";

        if (selections && selections.length > 0) {
          textToCopy = selections.map((sel) => model.getValueInRange(sel)).join("\n");
        }

        await navigator.clipboard.writeText(textToCopy);
      } catch (err) {
        console.error("Copy failed:", err);
      }
      break;
    }

    case "cut": {
      try {
        const selections = monacoEditor.getSelections();
        const model = monacoEditor.getModel();
        let textToCut = "";

        if (selections && selections.length > 0) {
          textToCut = selections.map((sel) => model.getValueInRange(sel)).join("\n");
          await navigator.clipboard.writeText(textToCut);
          monacoEditor.executeEdits(
            "cut",
            selections.map((sel) => ({
              range: sel,
              text: "",
              forceMoveMarkers: true,
            })),
          );
        }
      } catch (err) {
        console.error("Cut failed:", err);
      }
      break;
    }

    case "paste":
      try {
        const text = await navigator.clipboard.readText();
        monacoEditor.trigger("keyboard", "type", { text });
      } catch (err) {
        console.error("Paste failed:", err);
      }
      break;

    case "undo":
      monacoEditor.trigger("keyboard", "undo", null);
      break;

    case "redo":
      monacoEditor.trigger("keyboard", "redo", null);
      break;

    case "selectAll":
      monacoEditor.trigger("keyboard", "editor.action.selectAll", null);
      break;

    case "wordWrap":
      isWordWrapOn = !isWordWrapOn;
      if (currentTab) currentTab.wordWrap = isWordWrapOn;
      monacoEditor.updateOptions({
        wordWrap: isWordWrapOn ? "on" : "off",
        ...WRAP_MEASURE_OPTIONS,
        scrollbar: {
          horizontal: isWordWrapOn ? "hidden" : "auto",
        },
      });
      {
        const btn = e.target.closest('button[data-action="wordWrap"]');
        if (btn) {
          const svg = btn.querySelector("svg.checkmark");
          if (svg) svg.style.display = isWordWrapOn ? "inline-block" : "none";
        }
      }
      break;

    case "toggleMarkdown":
      const currentLang = monaco.editor.getModel(monacoEditor.getModel().uri).getLanguageId();
      isMarkdownOn = currentLang !== "markdown";
      if (currentTab) currentTab.isMarkdown = isMarkdownOn;
      monaco.editor.setModelLanguage(model, isMarkdownOn ? "markdown" : "monapad");
      monacoEditor.updateOptions({ autoClosingBrackets: isMarkdownOn ? "always" : "never" });
      applyDecorations();
      {
        const btn = e.target.closest('button[data-action="toggleMarkdown"]');
        if (btn) {
          const svg = btn.querySelector("svg.checkmark");
          if (svg) svg.style.display = isMarkdownOn ? "inline-block" : "none";
        }
      }
      break;
  }

  setTimeout(() => {
    customContextMenu.style.display = "none";
  }, 0);
});

// keep focus on editor when context menu is opened
customContextMenu.addEventListener("mousedown", (e) => {
  e.preventDefault();
});

// settings menu display
settingsButton.addEventListener("click", (e) => {
  e.stopPropagation();
  settingsMenu.style.display = "block";
  menu.style.display = "none";
  menuButton.style.pointerEvents = "auto";
});
editor.addEventListener("click", () => {
  settingsMenu.style.display = "none";
});
settingsMenu.addEventListener("click", (e) => {
  langChoices.hideDropdown();
  fontChoices.hideDropdown();
  // e.stopPropagation();
});
// prevent focus() from auto scrolling dropdown into view
settingsMenu.addEventListener("focusin", () => {
  if (scrollLocked) return;
  scrollLocked = true;
  lastScrollTop = settingsMenu.scrollTop;

  requestAnimationFrame(() => {
    settingsMenu.scrollTop = lastScrollTop;
  });

  setTimeout(() => {
    settingsMenu.scrollTop = lastScrollTop;
    scrollLocked = false;

    scrollAdjustQueue.forEach((fn) => fn());
    scrollAdjustQueue = [];
  }, 10);
});

// shortcuts
window.addEventListener("keydown", async (e) => {
  // Ctrl + S (+ Shift)
  if ((e.ctrlKey || e.metaKey) && e.code === "KeyS") {
    e.preventDefault();
    if (e.shiftKey) {
      saveAsFile();
    } else {
      saveFile();
    }
  }
  // Ctrl + O
  if ((e.ctrlKey || e.metaKey) && e.code === "KeyO") {
    e.preventDefault();
    openFile();
  }
  if ((e.ctrlKey || e.metaKey) && e.code === "Comma") {
    e.preventDefault();
    settingsMenu.style.display = "block";
  }
  // Ctrl + Shift + T
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === "KeyT") {
    if (externalCancelDragging) externalCancelDragging();
    e.preventDefault();
    await reopenRecentlyClosedFile();
  }
  // Ctrl + T
  else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.code === "KeyT") {
    if (externalCancelDragging) externalCancelDragging();
    e.preventDefault();
    createTab();
    switchTab(tabData.at(-1));
  }
  // Ctrl + N
  if ((e.ctrlKey || e.metaKey) && e.code === "KeyN") {
    e.preventDefault();
    window.electronAPI.createNewWindow();
  }
  // Ctrl + W
  if ((e.ctrlKey || e.metaKey) && e.code === "KeyW") {
    if (externalCancelDragging) externalCancelDragging();
    e.preventDefault();
    const data = currentTab;
    if (!data) return;
    await attemptCloseTab(data);
  }

  // Ctrl + 1-9
  if ((e.ctrlKey || e.metaKey) && /^Digit[1-9]$/.test(e.code)) {
    if (externalCancelDragging) externalCancelDragging();
    e.preventDefault();
    const index = parseInt(e.code.slice(-1), 10) - 1;
    if (tabData[index] && tabData[index] !== currentTab) {
      switchTab(tabData[index]);
    }
  }

  // Ctrl + Tab (+ Shift)
  if ((e.ctrlKey || e.metaKey) && e.code === "Tab") {
    if (externalCancelDragging) externalCancelDragging();
    e.preventDefault();
    if (!currentTab) return;

    const currentIndex = tabData.indexOf(currentTab);
    let nextIndex;

    if (e.shiftKey) {
      nextIndex = (currentIndex - 1 + tabData.length) % tabData.length;
    } else {
      nextIndex = (currentIndex + 1) % tabData.length;
    }

    switchTab(tabData[nextIndex]);
  }
});
