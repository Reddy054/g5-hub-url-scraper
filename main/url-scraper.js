function functionStartAlert() {
  const alertDiv = document.createElement("div");
  alertDiv.id = "alertDiv";
  alertDiv.className = "hub-scraper-alert";

  document.body.insertBefore(alertDiv, document.body.firstElementChild);

  alertDiv.innerHTML = `
    <p>
      Hub Scraper started<br>
      It may take some time!<br>
      This alert will disappear when it is finished.<br>
      <div class="cssLoader"></div>
    </p>
  `;

  Object.assign(alertDiv.style, {
    fontFamily: '"Open Sans", sans-serif',
    position: "fixed",
    top: "2em",
    right: "1em",
    zIndex: "999",
    textAlign: "center",
    borderRadius: "4px",
    minHeight: "48px",
    lineHeight: "1.5em",
    padding: "1.5em",
    boxShadow:
      "0 2px 2px 0 rgba(0, 0, 0, .14), 0 1px 5px 0 rgba(0, 0, 0, .12), 0 3px 1px -2px rgba(0, 0, 0, .2)",
    maxWidth: "400px",
    fontSize: "15px",
    color: "#fff",
    backgroundColor: "rgb(163, 190, 140)",
    cursor: "pointer",
    transition: "opacity 1s ease-in-out",
    opacity: "1",
  });

  alertDiv.addEventListener("click", () => alertDiv.remove());

  if (!document.getElementById("hubScraperStyle")) {
    const style = document.createElement("style");
    style.id = "hubScraperStyle";
    style.textContent = `
      .cssLoader {
        border: 4px solid #f3f3f3;
        border-top: 4px solid #3498db;
        border-radius: 50%;
        width: 30px;
        height: 30px;
        animation: spin 2s linear infinite;
        margin: 1em auto 0;
      }
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);
  }
}

function clearAlert() {
  let alertDiv = document.getElementById("alertDiv");
  if (alertDiv) {
    alertDiv.style.opacity = "0";
    setTimeout(() => alertDiv.remove(), 1000);
  }
}

function isClientHubPage() {
  const pattern = /^hub\.g5marketingcloud\.com\/admin\/clients\/[a-z0-9-]+$/;
  const currentURL = window.location.href.replace(/^(https?:\/\/)/, "");
  return pattern.test(currentURL);
}

let clientData;
if (isClientHubPage()) {
  clientData = {
    name: document.querySelector("div.h-card > h2 > a.u-uid").innerText,
    urn: document.querySelector(".p-g5-urn").innerText,
    domainType: document.querySelector(".p-g5-domain-type").innerText,
    vertical: document.querySelector(".p-g5-vertical").innerText,
  };
  if (clientData.domainType.toLowerCase().includes("single")) {
    clientData.domain = document.querySelector(".u-g5-domain").innerText;
  }
}

async function fetchDataRecursive() {
  let pageIteration = 1;
  let locationsJsonUrl = `https://hub.g5marketingcloud.com/admin/clients/${clientData.urn}/locations.json?order=name_asc&page=${pageIteration}`;

  async function getJsonData(url) {
    let fetchResult = await fetch(url);
    if (!fetchResult.ok) {
      throw new Error(
        `Error fetching data from ${url}: ${fetchResult.status} ${fetchResult.statusText}`
      );
    }
    let json = await fetchResult.json();
    return json;
  }

  async function fetchAndStoreData(url, jsonData = [], pageIteration) {
    try {
      let json = await getJsonData(url);
      jsonData.push(...json);
      pageIteration++;
      let nextUrl = `https://hub.g5marketingcloud.com/admin/clients/${clientData.urn}/locations.json?order=name_asc&page=${pageIteration}`;
      return fetchAndStoreData(nextUrl, jsonData, pageIteration);
    } catch (error) {
      console.error(error);
    }
    return jsonData;
  }

  return fetchAndStoreData(locationsJsonUrl, [], pageIteration);
}

function removeSpecialChars(str) {
  return str
    .replace(/[^A-Za-z0-9/]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function determineVertical() {
  let vertical = clientData.vertical;

  switch (true) {
    case vertical.includes("Apartments"):
      return "apartments";
    case vertical.includes("Senior"):
      return "senior-living";
    case vertical.includes("Storage"):
      return "self-storage";
    default:
      console.error("Was not able to detect a valid vertical!");
      return "Was not able to detect a valid vertical!";
  }
}

function determineDomainType() {
  let domainType = clientData.domainType;
  if (domainType === "SingleDomainClient") {
    return "singleDomain";
  } else if (domainType === "MultiDomainClient") {
    return "multiDomain";
  } else {
    console.error("Unable to determine domain type!");
    return "Unable to determine domain type!";
  }
}

function extractTLD(domain) {
  const regex = /\.([^.\/]+)$/;
  const match = domain.match(regex);
  if (match && match[1]) {
    return match[1];
  }
  return "";
}

function extractDomainName(url) {
  const regex =
    /^(?:https?:\/\/)?(?:[^:\/\n]+\.)?([^:\/\n.]+\.[^:\/\n.]+)(?:\/|$)/i;
  const match = url.match(regex);
  if (match && match[1]) {
    const domainWithTLD = match[1];
    const dotIndex = domainWithTLD.lastIndexOf(".");
    if (dotIndex !== -1) {
      return domainWithTLD.slice(0, dotIndex);
    }
    return domainWithTLD;
  }
  return "";
}

function extractSubdomain(url) {
  const regex = /^(?:https?:\/\/)?([^:\/\n]+\.)?([^:\/\n]+\.[^:\/\n]+)\b/i;
  const match = url.match(regex);
  if (match && match[1]) {
    return match[1].replace(".", "");
  }
  return "";
}

function parseData(jsonData, domainType, vertical, domain) {
  return jsonData.map((location) => {
    const base = {
      name: location.name,
      internalName: location.internal_branded_name,
      status: location.status,
      isCorp: location.corporate,
      customVertical: location.custom_vertical,
    };

    if (domainType === "multiDomain") {
      base.url = location.naked_domain;
    } else {
      base.url = domain;
      const verticalSegment = location.custom_vertical || vertical;
      base.path = removeSpecialChars(
        `${verticalSegment}/${location.state}/${location.city}/${location.custom_slug}`.toLowerCase()
      );
    }

    return base;
  });
}

function buildLiveUrl(url, path, corp, domainType) {
  if (domainType === "singleDomain") {
    return !path || corp ? url : `${url}/${path}`;
  } else {
    if (!url) return "undefined";
    const hasSubdomain = url.split(".").length >= 3 || url.includes("www.");
    return hasSubdomain ? `https://${url}` : `https://www.${url}`;
  }
}

function buildStaticUrl(url, path, corp, domainType) {
  if (!url) return "undefined";

  if (domainType === "singleDomain") {
    url = url.replace("https://", "http://") + ".g5static.com";
    return !path || corp ? url : `${url}/${path}`;
  } else {
    const hasSubdomain = url.split(".").length >= 3 || url.includes("www.");
    return hasSubdomain
      ? `http://${url}.g5static.com`
      : `http://www.${url}.g5static.com`;
  }
}

function buildStagingUrl(url, path, corp, domainType) {
  if (!url) return "undefined";

  const tld = extractTLD(url);
  const domainName = extractDomainName(url);
  const subDomain = extractSubdomain(url);

  let baseUrl = subDomain
    ? `http://${subDomain}.${domainName}-staging.${tld}.g5static.com`
    : `http://www.${domainName}-staging.${tld}.g5static.com`;

  if (domainType === "singleDomain") {
    return !path || corp ? baseUrl : `${baseUrl}/${path}`;
  } else {
    return baseUrl;
  }
}

async function buildUrls() {
  const domainType = determineDomainType();
  const vertical = determineVertical();
  const domain = clientData.domain;

  const jsonData = await fetchDataRecursive();
  const locations = parseData(jsonData, domainType, vertical, domain);

  return locations.map((location) => {
    const info = {
      name: location.name,
      internalName: location.internalName,
      status: location.status,
      liveUrl: buildLiveUrl(
        location.url,
        location.path,
        location.isCorp,
        domainType
      ),
      staticUrl: buildStaticUrl(
        location.url,
        location.path,
        location.isCorp,
        domainType
      ),
      stagingUrl: buildStagingUrl(
        location.url,
        location.path,
        location.isCorp,
        domainType
      ),
    };
    return location.isCorp ? { ...info, isCorporate: true } : info;
  });
}

async function createHtmlPage() {
  const start = performance.now();
  const locInfo = await buildUrls();
  // console.log(locInfo);

  const newWindow = window.open();

  const rows = [];

  locInfo.forEach((location) => {
    const isUndefined = !location.liveUrl || location.liveUrl === "undefined";
    const status = location.status || "Unknown";
    const statusClass = `${
      isUndefined ? "undefinedLocation " : ""
    }${status.toLowerCase()}Location`;

    const safe = (val) => (!val || val === "undefined" ? "undefined" : val);
    const link = (val) =>
      safe(val) === "undefined"
        ? `<span class="info">undefined</span>`
        : `<span class="info"><a href="${val}" target="_blank">${val}</a></span>`;

    rows.push(`
      <tr class="${statusClass}">
        <td><div class="statusCell">${status}</div></td>
        <td><div class="nameCell">
          <input class="nameCheckbox" type="checkbox" onchange="createCheckboxArray(this)" value="${
            location.name
          }">
          <span class="info">${location.name}</span>
          <button onclick="copyToClipboard('${location.name}')">Copy</button>
        </div></td>
        <td><div class="internalNameCell">
          ${
            safe(location.internalName) === "undefined"
              ? ""
              : `
            <input class="internalNameCheckbox" type="checkbox" onchange="createCheckboxArray(this)" value="${location.internalName}">
            <span class="info">${location.internalName}</span>
            <button onclick="copyToClipboard('${location.internalName}')">Copy</button>
          `
          }
        </div></td>
        <td><div class="liveCell urlCell">
          <input class="liveUrlCheckbox" type="checkbox" onchange="createCheckboxArray(this)" value="${safe(
            location.liveUrl
          )}">
          ${link(location.liveUrl)}
          <button onclick="copyToClipboard('${safe(
            location.liveUrl
          )}')">Copy</button>
        </div></td>
        <td><div class="staticCell urlCell">
          <input class="staticUrlCheckbox" type="checkbox" onchange="createCheckboxArray(this)" value="${safe(
            location.staticUrl
          )}">
          ${link(location.staticUrl)}
          <button onclick="copyToClipboard('${safe(
            location.staticUrl
          )}')">Copy</button>
        </div></td>
        <td><div class="stagingCell urlCell">
          <input class="stagingUrlCheckbox" type="checkbox" onchange="createCheckboxArray(this)" value="${safe(
            location.stagingUrl
          )}">
          ${link(location.stagingUrl)}
          <button onclick="copyToClipboard('${safe(
            location.stagingUrl
          )}')">Copy</button>
        </div></td>
      </tr>
    `);
  });

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Scraped - ${clientData.name}</title>
      <link rel="icon" type="image/x-icon" href="https://g5-assets-cld-res.cloudinary.com/image/upload/q_auto,f_auto,fl_lossy/e_colorize,co_white/v1686244719/g5/g5-c-5jqt5m1l7-g5-wis-team-cms/g5-cl-1lshjewwoa-g5-wis-team-cms-test-bed-bend-or/uploads/scraper_zjeifx.png">
     <style>
     :root {
  --primary-clr: #bbd9ec;
  --primary-clr-lighten: #dcebf4;
  --background-clr: #111;
}
body {
  font-family: sans-serif;
  background-color: #111;
  color: #fefefe;
}
h1 {
  margin: 0 auto;
  text-align: center;
  max-width: 50ch;
}
.urlCell a {
  line-break: anywhere;
}
a {
  color: var(--primary-clr);
}
a:hover {
  color: var(--primary-clr-lighten);
}
table {
  border-collapse: collapse;
  width: 100%;
}
td:not(:has(> div.statusCell)) {
  min-width: 19ch;
}
table td,
table th {
  border: 2px solid #fff;
  padding: 0.5em;
  margin: 0;
}
table th {
  font-size: 1.25em;
}
th button {
  margin-left: 1em;
}
tr {
  transition: background-color 0.2s ease-in-out;
}
tr:hover {
  background-color: rgba(255, 255, 255, 0.1);
  transition: background-color 0.1s ease-in-out;
}
button {
  height: fit-content;
  background: transparent;
  border: 1px solid #fff;
  color: #fff;
  border-radius: 4px;
  padding: 0.25em;
  display: inline;
  transition: all 0.25s ease-in-out;
  user-select: none;
  -moz-user-select: none;
  -khtml-user-select: none;
  -webkit-user-select: none;
  -o-user-select: none;
}
button:hover {
  background: var(--primary-clr);
  border: 1px solid #fff;
  color: #111;
  transition: all 0.25s ease-in-out;
}
.urlContainer {
  max-width: 95vw;
  width: 100%;
  margin: 0 auto;
}
.rp_disclaimer {
  display: flex;
  justify-content: center;
}
div.rp_disclaimer p {
  color: #fff;
  letter-spacing: 2px;
  bottom: 5px;
  border-radius: 20px;
  border: 1px solid #fff;
  padding: 1em;
  background-color: transparent;
  font-size: 0.65em;
  margin-top: 1em;
}
.credits {
  font-size: 0.45em;
  color: #fff;
}
td div {
  display: flex;
  align-items: center;
}
.nameCell button,
.urlCell button,
.undefinedDiv button,
.internalNameCell button {
  margin-left: auto;
  margin-right: 0;
}
div.headerButton button {
  font-size: 1.1em;
  position: relative;
  margin: 0.5em 0;
  left: 50%;
  transform: translateX(-50%);
}
.legend {
  width: fit-content;
  position: absolute;
  top: 7px;
  left: 3vw;
}
th div.header-cell {
  display: flex;
  align-items: center;
  justify-content: center;
}
p {
  margin: 0;
  padding: 0.5em;
}
.stickyNavHoverDiv {
  position: fixed;
  right: 0;
  bottom: 0;
  height: 123px;
  width: 25px;
}
.sticky-nav {
  position: fixed;
  opacity: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
  width: 50px;
  height: 103px;
  right: 10px;
  bottom: 10px;
  background-color: var(--primary-clr);
  border-radius: 27px;
  padding: 5px;
  transform: translateX(70px);
  transition: 0.5s transform ease-in-out, 5s opacity ease-in-out;
}
.stickyNavHoverDiv:hover .sticky-nav {
  opacity: 1;
  right: 10px;
  transform: translateX(0px);
  transition: 0.5s transform ease-in-out;
}
.sticky-nav div {
  width: 46px;
  height: 46px;
  background-color: #58798d;
  border: 2px solid #fff;
  border-radius: 50%;
  text-align: center;
  line-height: 50px;
  border-radius: 50%;
  color: #fff;
  cursor: pointer;
  transition: 0.15s all ease-in-out;
}
.sticky-nav div:hover {
  color: #303030;
  background-color: #30a4b3;
  transition: 0.15s all ease-in-out;
}
.stickyNavHoverDiv .pullout-bar {
  position: absolute;
  bottom: 37.5px;
  right: 65px;
  background-color: var(--primary-clr);
  clip-path: polygon(30% 0, 100% 0, 100% 100%, 30% 100%, 0% 85%, 0% 15%);
  height: 50px;
  width: 25px;
  transform: translateX(70px);
  transition: 0.5s transform ease-in-out;
}
.stickyNavHoverDiv:hover .pullout-bar {
  transform: translateX(25px);
  transition: 0.5s transform ease-in-out;
}
.pullout-bar div {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  height: 50%;
  width: 10%;
  background-color: rgba(51, 51, 51, 0.65);
}
.pullout-bar div:first-of-type {
  left: 25%;
}
.searchInputContainer {
  display: flex;
  position: absolute;
  justify-content: end;
  align-items: center;
  width: fit-content;
  right: 3vw;
}
.searchInputContainer > label[for="searchInput"] {
  margin-right: 1ch;
}
div#searchInputRegex {
  height: 1em;
  width: 1em;
  text-align: center;
  border: 1px solid white;
  border-radius: 2px;
  margin-left: 0.25ch;
  padding: 0.15em;
  font-size: 0.85em;
  transition: all 0.25s ease-in-out;
}
div#searchInputRegex:hover {
  cursor: pointer;
  color: #000;
  background-color: var(--primary-clr);
  transition: all 0.25s ease-in-out;
}
.searchInputContainer > input#searchInput {
  min-width: 20ch;
}

     </style>
    </head>
    <body>
      <h1>Scraped - ${clientData.name}</h1>
      <form class="searchInputContainer">
        <label for="searchInput">Search:</label>
        <input id="searchInput" type="text">
        <div id="searchInputRegex" data-value="unchecked" title="Enable Regex">.*</div>
      </form>
      <div class="headerButton">
        <button onclick="copySelectedUrls()">Copy Selected Cells</button>
      </div>
      <div class="urlContainer">
        <table>
          <tr class="header">
            <th><div class="header-cell">Status</div></th>
            <th><div class="header-cell">Name <button onclick="copyAllNames()">Copy All</button></div></th>
            <th><div class="header-cell">Internal Name <button onclick="copyAllInternalNames()">Copy All</button></div></th>
            <th><div class="header-cell">Live Urls <button onclick="copyAllLiveUrls()">Copy All</button></div></th>
            <th><div class="header-cell">Static Urls <button onclick="copyAllStaticUrls()">Copy All</button></div></th>
            <th><div class="header-cell">Staging Urls <button onclick="copyAllStagingUrls()">Copy All</button></div></th>
          </tr>
          ${rows.join("")}
        </table>
      </div>
      <div class="rp_disclaimer"><p>REALPAGE INTERNAL USE ONLY</p></div>
      <div class="legend">
        <label><input type="checkbox" id="liveLocationCheck" checked> Live</label><br>
        <label><input type="checkbox" id="pendingLocationCheck" checked> Pending</label><br>
        <label><input type="checkbox" id="deletedLocationCheck"> Deleted</label><br>
        <label><input type="checkbox" id="undefinedLocationCheck"> Undefined</label>
      </div>
      <div class="credits">
        <p>Tool created by: Lake & Logan Straly</p>
      </div>
      <div class="stickyNavHoverDiv">
        <div class="pullout-bar"><div></div><div></div></div>
        <div class="sticky-nav">
          <div class="up-arrow">&#8593;</div>
          <div class="down-arrow">&#8595;</div>
        </div>
      </div>
      <script type="text/javascript">
    let searchValue = '';
    function copyAllNames() {
        let namesArr = document.querySelectorAll('tr:not(.disabled) .nameCell .info');
        let names = [];
        for (let i = 0; i < namesArr.length; i++) {
            names.push(namesArr[i].innerText);
        }
        copyToClipboard(names.join('\\n'));
    }
    function copyAllInternalNames() {
        let namesArr = document.querySelectorAll('tr:not(.disabled) .internalNameCell .info');
        let names = [];
        for (let i = 0; i < namesArr.length; i++) {
            names.push(namesArr[i].innerText);
        }
        copyToClipboard(names.join('\\n'));
    }
    function copyAllLiveUrls() {
        let liveUrlsArr = document.querySelectorAll('tr:not(.disabled) .liveCell .info a');
        let liveUrls = [];
        for (let i = 0; i < liveUrlsArr.length; i++) {
            liveUrls.push(liveUrlsArr[i].innerText);
        }
        copyToClipboard(liveUrls.join('\\n'));
    }
    function copyAllStaticUrls() {
        let staticUrlsArr = document.querySelectorAll('tr:not(.disabled) .staticCell .info a');
        let staticUrls = [];
        for (let i = 0; i < staticUrlsArr.length; i++) {
            staticUrls.push(staticUrlsArr[i].innerText);
        }
        copyToClipboard(staticUrls.join('\\n'));
    }
    function copyAllStagingUrls() {
        let stagingUrlsArr = document.querySelectorAll('tr:not(.disabled) .stagingCell .info a');
        let stagingUrls = [];
        for (let i = 0; i < stagingUrlsArr.length; i++) {
            stagingUrls.push(stagingUrlsArr[i].innerText);
        }
        copyToClipboard(stagingUrls.join('\\n'));
    }

    function copyToClipboard(textToCopy) {
        if (navigator.clipboard && window.isSecureContext) {
            return navigator.clipboard.writeText(textToCopy);
        } else {
            let textArea = document.createElement("textarea");
            textArea.value = textToCopy;
            textArea.style.position = "fixed";
            textArea.style.left = "-999999px";
            textArea.style.top = "-999999px";
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            return new Promise((res, rej) => {
                document.execCommand('copy') ? res() : rej();
                textArea.remove();
            });
        }
    };

    let checkBoxUrls = [];
    function createCheckboxArray(checkBox) {
        let url = checkBox.value;
        if (checkBox.checked) {
            checkBoxUrls.push(url);
        } else {
            var index = checkBoxUrls.indexOf(url);
            if (index > -1) {
                checkBoxUrls.splice(index, 1);
            }
        }
    }
    function copySelectedUrls() {
        copyToClipboard(checkBoxUrls.join('\\n'));
    }

    let liveLocationCheck = document.getElementById('liveLocationCheck');
    let pendingLocationCheck = document.getElementById('pendingLocationCheck');
    let deletedLocationCheck = document.getElementById('deletedLocationCheck');
    let undefinedLocationCheck = document.getElementById('undefinedLocationCheck');

    liveLocationCheck.addEventListener('click', updateLocationLinks);
    pendingLocationCheck.addEventListener('click', updateLocationLinks);
    deletedLocationCheck.addEventListener('click', updateLocationLinks);
    undefinedLocationCheck.addEventListener('click', updateLocationLinks);

    let liveLocationTr = document.querySelectorAll('tr.liveLocation');
    let pendingLocationTr = document.querySelectorAll('tr.pendingLocation');
    let deletedLocationTr = document.querySelectorAll('tr.deletedLocation');
    let undefinedLocationTr = document.querySelectorAll('tr.undefinedLocation');

    function updateLocationLinks() {
        if (liveLocationCheck.checked) {
            for (let i = 0; i < liveLocationTr.length; i++) {
                liveLocationTr[i].style.display = "table-row";
                liveLocationTr[i].classList.remove('disabled');
            }
        } else if (!liveLocationCheck.checked) {
            for (let i = 0; i < liveLocationTr.length; i++) {
                liveLocationTr[i].style.display = "none";
                liveLocationTr[i].classList.add('disabled');
            }
        }
        if (pendingLocationCheck.checked) {
            for (let i = 0; i < pendingLocationTr.length; i++) {
                pendingLocationTr[i].style.display = "table-row";
                pendingLocationTr[i].classList.remove('disabled');
            }
        } else if (!pendingLocationCheck.checked) {
            for (let i = 0; i < pendingLocationTr.length; i++) {
                pendingLocationTr[i].style.display = "none";
                pendingLocationTr[i].classList.add('disabled');
            }
        }
        if (deletedLocationCheck.checked) {
            for (let i = 0; i < deletedLocationTr.length; i++) {
                deletedLocationTr[i].style.display = "table-row";
                deletedLocationTr[i].classList.remove('disabled');
            }
        } else if (!deletedLocationCheck.checked) {
            for (let i = 0; i < deletedLocationTr.length; i++) {
                deletedLocationTr[i].style.display = "none";
                deletedLocationTr[i].classList.add('disabled');
            }
        }
        if (undefinedLocationCheck.checked) {
            for (let i = 0; i < undefinedLocationTr.length; i++) {
                undefinedLocationTr[i].style.display = "table-row";
                undefinedLocationTr[i].classList.remove('disabled');
            }
        } else if (!undefinedLocationCheck.checked) {
            for (let i = 0; i < undefinedLocationTr.length; i++) {
                undefinedLocationTr[i].style.display = "none";
                undefinedLocationTr[i].classList.add('disabled');
            }
        }
    }
    let stickyNavAnchors = document.querySelectorAll('.sticky-nav div');
    let stickyNavUp = document.querySelector('.sticky-nav .up-arrow');
    let stickyNavDown = document.querySelector('.sticky-nav .down-arrow');

    updateLocationLinks();
    stickyNavAnchors.forEach((item) => {
        item.addEventListener('click', () => {
            if (item.innerText === '&#8593' || item.innerText === '↑') {
                window.scrollTo({
                    top: 0,
                    left: 0,
                    behavior: "smooth"
                  });
            } else if (item.innerText === '&#8595' || item.innerText === '↓') {
                window.scrollTo({
                    top: document.body.scrollHeight,
                    left: 0,
                    behavior: "smooth"
                });
            }
        });
    });

    let searchFilterInput = document.getElementById('searchInput');
    let searchFilterInputRegex = document.getElementById('searchInputRegex');
    let tableRows = document.querySelectorAll('tr:not(.header)');

    searchFilterInputRegex.addEventListener('click', () => {
        let isChecked = searchFilterInputRegex.dataset.value === 'checked';
        searchFilterInputRegex.dataset.value = isChecked ? 'unchecked' : 'checked';
        searchFilterInputRegex.style.backgroundColor = isChecked ? '' : 'var(--primary-clr)';
        searchFilterInputRegex.style.color = isChecked ? '' : '#000';
        applySearchFilter();
    });

    searchFilterInput.addEventListener('input', applySearchFilter);

    function applySearchFilter() {
        let isChecked = searchFilterInputRegex.dataset.value === 'checked';
        let searchValue = searchFilterInput.value.toLowerCase().trim();
        let regex = isChecked ? new RegExp(searchValue, 'i') : null;

        tableRows.forEach((row) => {
            let cellValues = row.querySelectorAll('td > div span.info');
            let found = Array.from(cellValues).some((value) => {
                let text = value.textContent.toLowerCase();
                return regex ? regex.test(text) : text.includes(searchValue);
            });
            row.style.display = found ? 'table-row' : 'none';
            row.classList.toggle('disabled', !found);
        });

        if (searchValue.length === 0) {
            updateLocationLinks();
        }
    }
    </script>
    </body>
    </html>
  `;

  clearAlert();
  newWindow.document.open();
  newWindow.document.write(htmlContent);
  newWindow.document.close();
  const end = performance.now();
  console.log(`✅ Total time: ${(end - start).toFixed(2)} ms`);
}

if (!isClientHubPage()) {
  console.error("Please make sure you're on the G5 client Hub page.");
  window.alert("Please make sure you're on the G5 client Hub page.");
} else {
  createHtmlPage();
  functionStartAlert();
}
