import { createHmac, createHash } from "node:crypto";
import { loadConfig } from "../../packages/core/src/config";

type BucketConfig = {
  name: string;
  policy?: string;
};

const buckets: BucketConfig[] = [
  { name: "kb-raw" },
  { name: "kb-preview" }
];

type CollectionConfig = {
  name: string;
  dim: number;
  distance: "Cosine" | "Euclid" | "Dot";
};

const collections: CollectionConfig[] = [
  { name: "knowledge_text", dim: 1024, distance: "Cosine" },
  { name: "knowledge_image", dim: 768, distance: "Cosine" }
];

const region = "us-east-1";

function hmac(key: string | Buffer, data: string) {
  return createHmac("sha256", key).update(data).digest();
}

function hexHmac(key: string | Buffer, data: string) {
  return createHmac("sha256", key).update(data).digest("hex");
}

function sha256(data: string) {
  return createHash("sha256").update(data).digest("hex");
}

function isoDates(date = new Date()) {
  const pad = (num: number, len = 2) => String(num).padStart(len, "0");
  const y = date.getUTCFullYear();
  const m = pad(date.getUTCMonth() + 1);
  const d = pad(date.getUTCDate());
  const h = pad(date.getUTCHours());
  const min = pad(date.getUTCMinutes());
  const s = pad(date.getUTCSeconds());
  const dateStamp = `${y}${m}${d}`;
  const amzDate = `${dateStamp}T${h}${min}${s}Z`;
  return { dateStamp, amzDate };
}

function buildS3Headers({
  endpoint,
  bucket,
  accessKey,
  secretKey
}: {
  endpoint: URL;
  bucket: string;
  accessKey: string;
  secretKey: string;
}) {
  const { dateStamp, amzDate } = isoDates();
  const service = "s3";
  const payloadHash = sha256("");
  const canonicalHeaders = `host:${endpoint.host}\n` + `x-amz-content-sha256:${payloadHash}\n` + `x-amz-date:${amzDate}\n`;
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = ["PUT", `/${bucket}`, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256(canonicalRequest)
  ].join("\n");

  const kDate = hmac(`AWS4${secretKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, "aws4_request");
  const signature = hexHmac(kSigning, stringToSign);

  return {
    Authorization: `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    "x-amz-date": amzDate,
    "x-amz-content-sha256": payloadHash
  };
}

async function ensureBucket(configBucket: BucketConfig, endpoint: URL, accessKey: string, secretKey: string) {
  const headers = buildS3Headers({ endpoint, bucket: configBucket.name, accessKey, secretKey });
  const response = await fetch(new URL(`/${configBucket.name}`, endpoint), {
    method: "PUT",
    headers
  });

  if (response.ok || response.status === 409) {
    console.log(`Bucket ${configBucket.name} ready (status ${response.status}).`);
  } else {
    const body = await response.text();
    throw new Error(`Failed to create bucket ${configBucket.name}: ${response.status} ${body}`);
  }
}

async function ensureCollection(collection: CollectionConfig, qdrantUrl: URL) {
  const body = {
    vectors: {
      size: collection.dim,
      distance: collection.distance
    }
  };

  const response = await fetch(new URL(`/collections/${collection.name}`, qdrantUrl), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (response.ok) {
    console.log(`Collection ${collection.name} ready.`);
    return;
  }

  const details = await response.text();
  if (response.status === 409) {
    console.log(`Collection ${collection.name} already exists.`);
  } else {
    throw new Error(`Failed to ensure collection ${collection.name}: ${response.status} ${details}`);
  }
}

async function main() {
  const cfg = loadConfig({ envFile: process.env.ENV_FILE ?? ".env" });
  const minioEndpoint = new URL(cfg.MINIO_ENDPOINT);
  const qdrantEndpoint = new URL(cfg.QDRANT_URL);

  for (const bucket of buckets) {
    await ensureBucket(bucket, minioEndpoint, cfg.MINIO_ACCESS_KEY, cfg.MINIO_SECRET_KEY);
  }

  for (const collection of collections) {
    await ensureCollection(collection, qdrantEndpoint);
  }

  console.log("Storage bootstrap completed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
