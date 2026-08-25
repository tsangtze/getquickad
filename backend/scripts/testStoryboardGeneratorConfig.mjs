import {
  generateStoryboard
} from "../storyboardGenerator.mjs";

const project = {
  description:
    "Portable coffee maker, rechargeable and compact.",
  website:
    "mycoffee.com",
  callToAction:
    "Shop Now",
  style:
    "Professional",
  assets: {
    productImages: [
      {
        storedName:
          "product-01.jpg"
      }
    ]
  }
};

let missingKeyRejected = false;

try {
  await generateStoryboard({
    project,
    apiKey: ""
  });
} catch (error) {
  if (
    error.code ===
    "OPENAI_API_KEY_MISSING"
  ) {
    missingKeyRejected = true;
  } else {
    throw error;
  }
}

if (!missingKeyRejected) {
  throw new Error(
    "Generator did not reject a missing API key."
  );
}

console.log(
  "PASS: Missing API key rejected safely."
);

console.log(
  "PASS: No OpenAI request was made."
);
