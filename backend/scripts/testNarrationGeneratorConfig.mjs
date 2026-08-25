import {
  generateNarration
} from "../narrationGenerator.mjs";

const storyboard = {
  style: "Professional",
  scenes: [
    {
      narration:
        "This test must not make an API request."
    }
  ]
};

let missingKeyRejected = false;

try {
  await generateNarration({
    storyboard,
    projectDirectory:
      "unused-test-directory",
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
    "Narration generator did not reject a missing API key."
  );
}

console.log(
  "PASS: Missing narration API key rejected safely."
);

console.log(
  "PASS: No text-to-speech request was made."
);
