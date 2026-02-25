import * as monaco from "monaco-editor";
import Choices from "choices.js";
import "choices.js/public/assets/styles/choices.min.css";
import "./custom-choices.css";
import i18next from "i18next";

const toolbar = document.getElementById("toolbar");
const tabsContainer = document.getElementById("tabs-container");
const tabs = document.getElementById("tabs");
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
const about = document.getElementById("about");
const fileDropBox = document.getElementById("file-drop-background");
const fileDrop = document.getElementById("file-drop");

// tab dragging
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
};
const settings = JSON.parse(localStorage.getItem("editorSettings")) || defaultSettings;
let selectedFontFamily = localStorage.getItem("selectedFontFamily") || "Iosevka";
let monacoEditor = null;

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
let currentWatcher = null;
// watch css file used as current theme
let currentWatchedCssFile = null;

// get window id
let myWindowId = null;
window.electronAPI.onAssignWindowId((id) => {
  myWindowId = id;
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

// receive data on open in new window
window.electronAPI.onLoadTabData((receivedTabData) => {
  // remove existing initial tab
  if (tabData.length === 1 && !tabData[0].content.trim() && !tabData[0].path) {
    const defaultTab = tabData[0];
    tabs.removeChild(defaultTab.element);
    tabData = [];
  }

  // create new tab
  const newTab = createTab(receivedTabData.name, receivedTabData.content, receivedTabData.path);
  const newTabData = tabData[tabData.length - 1];

  // restore tab data
  newTabData.isFileSaved = receivedTabData.isFileSaved;
  newTabData.originalContent = receivedTabData.originalContent;
  newTabData.fontSize = receivedTabData.fontSize;
  newTabData.wordWrap = receivedTabData.wordWrap;
  newTabData.isMarkdown = receivedTabData.isMarkdown;

  // restore save state
  if (!receivedTabData.isFileSaved) {
    const close = newTabData.element.querySelector(".close");
    if (close) close.classList.add("show-unsaved");
  }

  if (receivedTabData.hasReloadButton) {
    reloadButton(newTabData, receivedTabData.path, "add");
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
  document.getElementById("fontDescription").innerHTML = i18next.t("settings.fontDescription");
  document.querySelector("#settingsLayout .h1").textContent = i18next.t("settings.layout");
  document.querySelector("#toggleStatusBar span").textContent = i18next.t("settings.statusBar");
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
  document.getElementById("confirm-save-yes").textContent = i18next.t("modal.confirmSave");
  document.getElementById("confirm-save-no").textContent = i18next.t("modal.dontSave");
  document.getElementById("confirm-save-cancel").textContent = i18next.t("modal.cancel");
  document.querySelector("#confirm-save-window p").textContent = i18next.t("modal.confirmSaveWindow");
  document.getElementById("confirm-save-all").textContent = i18next.t("modal.saveAll");
  document.getElementById("confirm-discard-all").textContent = i18next.t("modal.discardAll");
  document.getElementById("confirm-cancel-all").textContent = i18next.t("modal.cancel");
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

function applyDecorations() {
  const model = monacoEditor.getModel();
  if (!model) return;

  if (!settings.syntaxHighlight) {
    currentDecorations = monacoEditor.deltaDecorations(currentDecorations, []);
    return;
  }

  const fullText = model.getValue();
  const lines = fullText.split("\n");
  const decorations = [];

  if (model.getLanguageId() !== "monapad") {
    currentDecorations = monacoEditor.deltaDecorations(currentDecorations, []);
    return;
  }

  let insideCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimStart();
    const leadingSpaces = line.length - trimmed.length;

    if (trimmed.startsWith("```")) {
      insideCodeBlock = !insideCodeBlock;
      continue;
    }

    if (insideCodeBlock) continue;

    const matchers = [
      { regex: /^#\s[^#]/, className: "heading-1" }, // heading 1
      { regex: /^##\s[^#]/, className: "heading-2" }, // heading 2
      { regex: /^###\s[^#]/, className: "heading-3" }, // heading 3
      { regex: /^-#\s[^#]/, className: "sub-text" }, // sub text
      { regex: /^>\s/, className: "block-quote" }, // block quote
    ];

    for (const { regex, className } of matchers) {
      const match = trimmed.match(regex);
      if (match) {
        const markerLength = match[0].length;
        const startColumn = leadingSpaces + 1;
        const endColumn = startColumn + markerLength - 1;

        decorations.push({
          range: new monaco.Range(i + 1, startColumn, i + 1, endColumn),
          options: { inlineClassName: "marker-transparent" },
        });

        break;
      }
    }
  }

  currentDecorations = monacoEditor.deltaDecorations(currentDecorations, decorations);
}

// detect change in editor
monacoEditor.onDidChangeModelContent(() => {
  const active = tabData.find((t) => t.element.classList.contains("active"));
  if (!active) return;

  const currentContent = monacoEditor.getValue();
  active.content = currentContent;

  // use active._ignoreUnsavedCheck = ture before monacoEditor.getValue() when this process is unnecessary
  if (active._ignoreUnsavedCheck) {
    active._ignoreUnsavedCheck = false;
    return;
  }

  const hasUnsavedChanges = currentContent.trim() !== (active.originalContent || "").trim();
  active.isFileSaved = !hasUnsavedChanges;

  // display unsaved dot
  const close = active.element.querySelector(".close");
  if (close) {
    if (hasUnsavedChanges) {
      close.classList.add("show-unsaved");
    } else {
      close.classList.remove("show-unsaved");
    }
  }

  updateStatusBar();
  applyDecorations();
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
  });
  document.fonts.ready.then(() => {
    monaco.editor.remeasureFonts();
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

  // status bar visibility
  const statusBar = document.getElementById("status-bar");
  const checkmark = document.querySelector("#toggleStatusBar .checkmark");
  if (settings.statusBarVisible) {
    statusBar.style.display = "flex";
    checkmark.style.display = "inline-block";
    editor.style.height = "calc(100vh - 35px - 25px)";
    settingsMenu.style.height = "calc(100vh - 35px - 25px)";
  } else {
    statusBar.style.display = "none";
    checkmark.style.display = "none";
    editor.style.height = "calc(100vh - 35px)";
    settingsMenu.style.height = "calc(100vh - 35px)";
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
      tabs.classList.remove("dragging");
      draggingTab.style.opacity = "0.5";
      overlayWindowVisible = true;
      window.electronAPI.createCursorWindow();

      if (shouldCheckWindow()) {
        const isWarn = draggingTabData.isWarned;
        window.electronAPI.getWindowIdAt({ x: e.screenX, y: e.screenY }).then(async (targetWindowId) => {
          if (!windowBoundsCache) {
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
    }

    currentX = mouseX - startX;
    draggingTab.style.transform = `translateX(${currentX}px)`;

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
      .then((targetWindowId) => {
        if (targetWindowId && targetWindowId !== myWindowId && !isInMyWindow) {
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
            hasReloadButton: releasedTabData.element?.classList.contains("has-reload-button"),
          };
          window.electronAPI.sendTabToWindow(targetWindowId, tabInfo).then(() => {
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

  const tabInfo = {
    name: targetTabData.name,
    content: targetTabData.model.getValue(),
    path: targetTabData.path,
    isFileSaved: targetTabData.isFileSaved,
    originalContent: targetTabData.originalContent,
    fontSize: targetTabData.fontSize,
    wordWrap: targetTabData.wordWrap,
    isMarkdown: targetTabData.isMarkdown,
    hasReloadButton: targetTabData.element?.classList.contains("has-reload-button"),
  };

  await window.electronAPI.createNewWindowWithTab(tabInfo, position);
  removeTabAndAdjustUI(targetTabData);
}

function removeTabAndAdjustUI(targetTabData) {
  const index = tabData.indexOf(targetTabData);
  if (index === -1) return;

  tabs.removeChild(targetTabData.element);
  tabData.splice(index, 1);

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
  return new Promise((resolve) => {
    const tab = data.element;

    if (!data.isFileSaved) {
      const message = confirmSave.querySelector("p");

      message.textContent = i18next.t("modal.saveChanges", { name: data.name });
      confirmBox.style.display = "flex";
      confirmSave.style.display = "flex";
      isModalDisplayed = true;

      const actuallyCloseTab = () => {
        if (data.path) {
          const tabIndex = tabData.indexOf(data);
          addToRecentlyClosedFiles(data.path, tabIndex);
        }

        const index = tabData.indexOf(data);
        tabs.removeChild(tab);
        updateTabsCompactClass();
        if (data.model) data.model.dispose();
        tabData = tabData.filter((t) => t !== data);

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
          actuallyCloseTab();
          resolve("closed");
        } else {
          resolve("cancelled");
        }

        removeListeners();
      };

      const onDontSave = () => {
        confirmBox.style.display = "none";
        confirmSave.style.display = "none";
        isModalDisplayed = false;
        actuallyCloseTab();
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

      yesBtn.addEventListener("click", onSave);
      noBtn.addEventListener("click", onDontSave);
      cancelBtn.addEventListener("click", onCancel);
      return;
    }

    // close immediately when save is not required
    if (data.path) {
      const tabIndex = tabData.indexOf(data);
      addToRecentlyClosedFiles(data.path, tabIndex);
    }
    const index = tabData.indexOf(data);
    tabs.removeChild(tab);
    updateTabsCompactClass();
    if (data.model) data.model.dispose();
    tabData = tabData.filter((t) => t !== data);

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

  recentlyClosedFiles = recentlyClosedFiles.filter((item) => item.path !== filePath);
  recentlyClosedFiles.unshift({ path: filePath, index: tabIndex });
  if (recentlyClosedFiles.length > 10) {
    recentlyClosedFiles = recentlyClosedFiles.slice(0, 10);
  }

  if (recentlyClosedFiles.length >= 1) {
    const reopenBtn = document.querySelector('[data-action="reopenClosedTab"]');
    reopenBtn?.classList.remove("disabled");
  }
}
// open recently closed files
async function reopenRecentlyClosedFile() {
  if (recentlyClosedFiles.length === 0) return;
  const { path: filePath, index: originalIndex } = recentlyClosedFiles.shift();
  const restoreIndex = Math.min(originalIndex, tabData.length);
  await loadFileByPath(filePath, restoreIndex);
  if (recentlyClosedFiles.length === 0) {
    const reopenBtn = document.querySelector('[data-action="reopenClosedTab"]');
    reopenBtn?.classList.add("disabled");
  }
}

// close window
function attemptCloseWindow() {
  const hasUnsavedTabs = tabData.some((tab) => !tab.isFileSaved);
  if (!hasUnsavedTabs) {
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

  const onDiscardAll = () => {
    closeConfirm();
    removeListeners();

    // close all tabs
    for (const tab of [...tabData]) {
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

  saveAllBtn.addEventListener("click", onSaveAll);
  discardAllBtn.addEventListener("click", onDiscardAll);
  cancelAllBtn.addEventListener("click", onCancelAll);
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

  if (data.originalContent === undefined) {
    data.originalContent = data.content;
  }

  currentTab = data;
  currentFilePath = data.path || data.name;

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

  // stop current watcher
  if (currentWatcher) {
    clearInterval(currentWatcher);
    currentWatcher = null;
  }

  // watch tab with path
  if (data.path) {
    window.electronAPI.watchFile(data.path);
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

  if (targetTab.isFileSaved && (content === targetTab._lastExternalContent || content === targetTab.originalContent)) {
    reloadButton(targetTab, null, "remove");
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
  tab.originalContent = content;
  tab.isFileSaved = true;

  if (tab !== currentTab) switchTab(tab);
  tab.viewState = monacoEditor.saveViewState();
  tab.model.setValue(content);

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
    showMessage("file-opened");
    console.log("path already opened. switching to that tab.");
    return;
  }

  const content = await window.electronAPI.readFile(filePath);
  if (content === null || content === undefined) {
    console.error("Failed to read file.");
    return;
  }

  const isMarkdownFile = /\.(md|markdown)$/i.test(filePath);

  if (tabData.length === 1) {
    const singleTab = tabData[0];
    const currentContent = monacoEditor ? monacoEditor.getValue() : "";
    if (!singleTab.content.trim() && !currentContent.trim()) {
      singleTab.name = filePath.split(/[/\\]/).pop();
      singleTab.content = content;
      singleTab._lastExternalContent = content;
      singleTab.path = filePath;
      singleTab.originalContent = content;
      singleTab.isFileSaved = true;
      singleTab.isMarkdown = isMarkdownFile;

      const nameSpan = singleTab.element.querySelector(".name");
      if (nameSpan) {
        nameSpan.textContent = singleTab.name;
        nameSpan.title = singleTab.name;
      }

      const close = singleTab.element.querySelector(".close");
      if (close) close.classList.remove("show-unsaved");

      singleTab.model.setValue(content);
      switchTab(singleTab);
      updateRecentFiles(filePath);
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

  const newTab = createTab(filePath.split(/[/\\]/).pop(), content, filePath, targetIndex);
  const newTabData = tabData[tabData.length - 1];
  newTabData.originalContent = content;
  newTabData._lastExternalContent = content;
  newTabData.isFileSaved = true;
  newTabData.isMarkdown = isMarkdownFile;

  const newTabClose = newTabData.element.querySelector(".close");
  if (newTabClose) newTabClose.classList.remove("show-unsaved");

  switchTab(newTab);
  updateRecentFiles(filePath);
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
  const { filePath } = await window.electronAPI.showSaveDialog(active.name);
  if (!filePath) return false;

  const result = await window.electronAPI.saveToFile(filePath, content);
  if (result.success) {
    active.path = filePath;
    active.name = filePath.split(/[\\/]/).pop();
    active.element.querySelector(".name").textContent = active.name;
    active.element.querySelector(".name").title = active.name;
    active.originalContent = content;
    active.isFileSaved = true;
    active._lastExternalContent = content;

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

// file saved & file already opened message
const messageQueue = [];
let isShowingMessage = false;
let isWindowFocused = true; // default is focused

function showMessage(id) {
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

// Tab context menu handler
document.addEventListener("contextmenu", async (e) => {
  const tabElement = e.target.closest(".tab");
  if (!tabElement) return;

  e.preventDefault();
  rightClickedTab = tabData.find((t) => t.element === tabElement);
  if (!rightClickedTab) return;

  // update reopen closed tab button
  const validItems = [];
  for (const item of recentlyClosedFiles) {
    const exists = await window.electronAPI.fileExists(item.path);
    if (exists) validItems.push(item);
  }
  if (validItems.length !== recentlyClosedFiles.length) {
    recentlyClosedFiles = validItems;
    const reopenBtn = document.querySelector('[data-action="reopenClosedTab"]');
    reopenBtn.classList.toggle("disabled", recentlyClosedFiles.length === 0);
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
