const http = require("http");
const path = require("path");
const fs = require("fs");
const fsp = require("fs/promises");

const host = process.env.HOST || "0.0.0.0";
const port = Number(process.env.PORT || 3000);
const rootDir = __dirname;
const signaturesPath = path.join(rootDir, "data", "signatures.json");
const legacySignaturesPath = path.join(rootDir, "signatures.txt");

const staticContentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
};

const noStoreHeaders = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  Pragma: "no-cache",
  Expires: "0",
};

const sendJson = (response, statusCode, body, extraHeaders = {}) => {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    ...noStoreHeaders,
    ...extraHeaders,
  });
  response.end(JSON.stringify(body));
};

const sendText = (response, statusCode, body) => {
  response.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    ...noStoreHeaders,
  });
  response.end(body);
};

const cleanName = (value) => String(value || "").trim().replace(/\s+/g, " ");
const cleanEmail = (value) => String(value || "").trim().toLowerCase();
const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const parseLegacySignerNames = async () => {
  try {
    const raw = await fsp.readFile(legacySignaturesPath, "utf8");
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((fullName) => ({
        fullName,
        email: "",
        createdAt: null,
      }));
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
};

const readStoredSignatures = async () => {
  try {
    const raw = await fsp.readFile(signaturesPath, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter((entry) => entry && typeof entry === "object")
      .map((entry) => ({
        fullName: cleanName(entry.fullName),
        email: cleanEmail(entry.email),
        createdAt: typeof entry.createdAt === "string" ? entry.createdAt : null,
      }))
      .filter((entry) => entry.fullName);
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
};

const readAllSignatures = async () => {
  const [legacy, stored] = await Promise.all([parseLegacySignerNames(), readStoredSignatures()]);
  return [...legacy, ...stored];
};

const writeStoredSignatures = async (signatures) => {
  await fsp.mkdir(path.dirname(signaturesPath), { recursive: true });
  const tempPath = `${signaturesPath}.tmp`;
  await fsp.writeFile(tempPath, JSON.stringify(signatures, null, 2), "utf8");
  await fsp.rename(tempPath, signaturesPath);
};

const collectBody = (request) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      chunks.push(chunk);
      size += chunk.length;
      if (size > 1024 * 1024) {
        reject(new Error("Request body too large."));
        request.destroy();
      }
    });
    request.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    request.on("error", reject);
  });

const parseSubmissionBody = (request, rawBody) => {
  const contentType = String(request.headers["content-type"] || "").toLowerCase();
  if (contentType.includes("application/json")) {
    return JSON.parse(rawBody || "{}");
  }
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams(rawBody);
    return {
      fullName: params.get("full-name") || params.get("fullName"),
      email: params.get("email"),
    };
  }
  return {};
};

const handleSubmitSignature = async (request, response) => {
  let parsed;
  try {
    const rawBody = await collectBody(request);
    parsed = parseSubmissionBody(request, rawBody);
  } catch (error) {
    sendJson(response, 400, {
      error: "Invalid request payload.",
    });
    return;
  }

  const fullName = cleanName(parsed.fullName || parsed["full-name"]);
  const email = cleanEmail(parsed.email);
  if (!fullName || (email && !isValidEmail(email))) {
    sendJson(response, 422, {
      error: "A valid full name is required.",
    });
    return;
  }

  try {
    const existing = await readStoredSignatures();
    const alreadyExists = existing.some(
      (entry) =>
        entry.fullName.localeCompare(fullName, undefined, { sensitivity: "accent" }) === 0 &&
        entry.email === email
    );

    if (!alreadyExists) {
      existing.push({
        fullName,
        email,
        createdAt: new Date().toISOString(),
      });
      await writeStoredSignatures(existing);
    }

    sendJson(response, 201, {
      ok: true,
    });
  } catch (error) {
    console.error("Failed to save signature:", error);
    sendJson(response, 500, {
      error: "Could not save the signature right now.",
    });
  }
};

const serveStatic = async (pathname, response, method) => {
  const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const normalizedPath = path.normalize(relativePath);
  if (normalizedPath.startsWith("..")) {
    sendText(response, 403, "Forbidden");
    return;
  }

  const absolutePath = path.join(rootDir, normalizedPath);
  let stat;
  try {
    stat = await fsp.stat(absolutePath);
  } catch (error) {
    if (error.code === "ENOENT") {
      sendText(response, 404, "Not found");
      return;
    }
    throw error;
  }

  if (stat.isDirectory()) {
    await serveStatic(path.posix.join(pathname.replace(/\/$/, ""), "index.html"), response, method);
    return;
  }

  const extension = path.extname(absolutePath).toLowerCase();
  const contentType = staticContentTypes[extension] || "application/octet-stream";
  response.writeHead(200, {
    "Content-Type": contentType,
    "Content-Length": stat.size,
  });
  if (method === "HEAD") {
    response.end();
    return;
  }
  fs.createReadStream(absolutePath).pipe(response);
};

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  const pathname = requestUrl.pathname;

  if (request.method === "GET" && pathname === "/sign-petition/signatures") {
    try {
      const signatures = await readAllSignatures();
      sendJson(response, 200, { signatures });
    } catch (error) {
      console.error("Failed to read signatures:", error);
      sendJson(response, 500, {
        error: "Could not load signatures.",
      });
    }
    return;
  }

  if (request.method === "POST" && pathname === "/sign-petition") {
    await handleSubmitSignature(request, response);
    return;
  }

  if (request.method === "GET" || request.method === "HEAD") {
    try {
      await serveStatic(pathname, response, request.method);
    } catch (error) {
      console.error("Failed to serve static file:", error);
      sendText(response, 500, "Internal server error");
    }
    return;
  }

  sendText(response, 405, "Method not allowed");
});

server.listen(port, host, () => {
  console.log(`Energy Forward Australia server listening on http://${host}:${port}`);
});
