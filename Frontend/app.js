function uiText(key, fallback, params = {}) {
  return window.QuickAdI18n?.t(key, params) || fallback;
}

async function updateQuota_old() {
  try {
    const res = await fetch('/api/projects/usage', { credentials: 'include' });
    const data = await res.json();
    if (!data.ok) return;
    const u = data.usage;
    const el = document.getElementById('quotaBanner');
    if (el) {
      el.innerHTML = uiText("quota.html", "<strong>{remaining} / {freeLimit} free videos left</strong> - {projects} / {projectLimit} projects", { remaining: u.freeVideosRemaining, freeLimit: data.limits.FREE_FINAL_VIDEOS, projects: u.projectCount, projectLimit: data.limits.MAX_PROJECTS }) + (!u.canCreateMoreProjects ? ' <span style="color:#b91c1c">' + uiText("quota.project_limit", "Limit reached, delete a project") + '</span>' : "") + (!u.canGenerateMoreVideos ? ' <span style="color:#b91c1c">' + uiText("quota.video_limit", "Free video limit reached") + '</span>' : "");
    }
  } catch {}
}
let accountProjectHistory = [];
let accountHistoryRevision = 0;
let accountListRequest = 0;

const MAX_IMAGES = 10;
let PROJECT_HISTORY_KEY =
  null;
const MAX_RECENT_PROJECTS = 10;
const PROJECT_ID_PATTERN =
  /^[0-9a-f-]{36}$/i;
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp"
]);

const form = document.querySelector("#video-form");
const imageInput = document.querySelector("#product-images");
const logoInput = document.querySelector("#product-logo");
const uploadZone = document.querySelector("#upload-zone");
const previewList = document.querySelector("#image-preview-list");
const imageCount = document.querySelector("#image-count");
const logoName = document.querySelector("#logo-name");
const description = document.querySelector("#productDesc");
const characterCount = document.querySelector("#character-count");
const uploadError = document.querySelector("#upload-error");
const descriptionError = document.querySelector("#description-error");
const formMessage = document.querySelector("#form-message");
const createButton = document.querySelector("#create-button");
const recentProjects =
  document.querySelector(
    "#recent-projects"
  );
const recentProjectList =
  document.querySelector(
    "#recent-project-list"
  );
const recentProjectStatus =
  document.querySelector(
    "#recent-project-status"
  );
const clearProjectHistoryButton =
  document.querySelector(
    "#clear-project-history"
  );

const styleOptions = [...document.querySelectorAll(".style-option")];
const planReview = document.querySelector("#plan-review");
const planScenes = document.querySelector("#plan-scenes");
const planStatus = document.querySelector("#plan-status");
const callToActionSelect =
  document.querySelector(
    "#call-to-action"
  );

const customCtaField =
  document.querySelector(
    "#custom-cta-field"
  );

const customCtaInput =
  document.querySelector(
    "#custom-call-to-action"
  );

const customCtaCount =
  document.querySelector(
    "#custom-cta-count"
  );

const customCtaError =
  document.querySelector(
    "#custom-cta-error"
  );

const finalVideoButton = document.querySelector("#final-video-button");
const undoSceneButton = document.querySelector("#undo-scene-button");
const sceneCountMessage = document.querySelector("#scene-count-message");
const narratorOptions = [
  ...document.querySelectorAll(
    'input[name="narratorVoice"]'
  )
];

let selectedImages = [];
let currentProjectId = "";
let currentStoryboard = null;
let reviewImageUrls = [];
let currentReviewImageCount = 0;

function fileKey(file) {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

function setUploadError(message = "") {
  uploadError.textContent = message;
}

function syncImageInput() {
  const transfer = new DataTransfer();

  selectedImages.forEach((file) => {
    transfer.items.add(file);
  });

  imageInput.files = transfer.files;
}

function renderImagePreviews() {
  previewList.replaceChildren();

  selectedImages.forEach((file, index) => {
    const preview = document.createElement("div");
    preview.className = "image-preview";

    const image = document.createElement("img");
    image.alt = uiText("upload.preview_alt", `Selected product image ${index + 1}`, { number: index + 1 });

    const imageUrl = URL.createObjectURL(file);
    image.src = imageUrl;
    image.addEventListener(
      "load",
      () => URL.revokeObjectURL(imageUrl),
      { once: true }
    );

    const removeButton = document.createElement("button");
    removeButton.className = "remove-image";
    removeButton.type = "button";
    removeButton.setAttribute(
      "aria-label",
      `Remove ${file.name}`
    );
    removeButton.textContent = "×";

    removeButton.addEventListener("click", () => {
      selectedImages.splice(index, 1);
      syncImageInput();
      renderRecentProjects();
renderImagePreviews();
      setUploadError();
    });

    preview.append(image, removeButton);
    previewList.append(preview);
  });

  imageCount.textContent = uiText("upload.count", `${selectedImages.length} of ${MAX_IMAGES}`, { count: selectedImages.length, max: MAX_IMAGES });

  if (selectedImages.length > 0) {
    imageCount.style.color = "var(--success)";
  } else {
    imageCount.style.color = "";
  }
}

function addImages(files) {
  setUploadError();

  const incomingFiles = [...files];

  const invalidFile = incomingFiles.find(
    (file) => !ALLOWED_TYPES.has(file.type)
  );

  if (invalidFile) {
    setUploadError(
      uiText("upload.type_error", "Please use only JPG, PNG, or WebP product images.")
    );
    return;
  }

  const existingKeys = new Set(selectedImages.map(fileKey));
  const uniqueFiles = incomingFiles.filter(
    (file) => !existingKeys.has(fileKey(file))
  );

  if (selectedImages.length + uniqueFiles.length > MAX_IMAGES) {
    setUploadError(
      uiText("upload.max_error", `You can upload a maximum of ${MAX_IMAGES} product images.`, { max: MAX_IMAGES })
    );
    return;
  }

  selectedImages.push(...uniqueFiles);
  syncImageInput();
  renderRecentProjects();
renderImagePreviews();
}

imageInput.addEventListener("change", () => {
  addImages(imageInput.files);
});

["dragenter", "dragover"].forEach((eventName) => {
  uploadZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    uploadZone.classList.add("dragging");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  uploadZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    uploadZone.classList.remove("dragging");
  });
});

uploadZone.addEventListener("drop", (event) => {
  addImages(event.dataTransfer.files);
});

logoInput.addEventListener("change", () => {
  const logo = logoInput.files[0];

  if (!logo) {
    logoName.textContent = "";
    return;
  }

  if (!ALLOWED_TYPES.has(logo.type)) {
    logoInput.value = "";
    logoName.textContent = "";
    setUploadError(
      "Please use a JPG, PNG, or WebP logo."
    );
    return;
  }

  setUploadError();
  logoName.textContent = logo.name;
});

description?.addEventListener("input", () => {
  characterCount.textContent = `${description.value.length} / 500`;

  if (description.value.trim()) {
    descriptionError.textContent = "";
  }
});

styleOptions.forEach((option) => {
  const radio = option.querySelector('input[type="radio"]');

  radio.addEventListener("change", () => {
    styleOptions.forEach((item) => {
      item.classList.toggle(
        "selected",
        item.querySelector('input[type="radio"]').checked
      );
    });
  });
});

function clearReviewImageUrls() {
  window.quickAdMusic.stop();
  reviewImageUrls.forEach((imageUrl) => {
    if (
      String(imageUrl).startsWith(
        "blob:"
      )
    ) {
      URL.revokeObjectURL(imageUrl);
    }
  });

  reviewImageUrls = [];
  currentReviewImageCount = 0;
}

function selectedNarratorVoice() {
  return (
    narratorOptions.find(
      (option) => option.checked
    )?.value ||
    "automatic"
  );
}

const deletedSceneHistory = [];

const SCENE_TIMELINES = {
  3: [
    [0, 7],
    [7, 17],
    [17, 25]
  ],
  4: [
    [0, 5],
    [5, 12],
    [12, 19],
    [19, 25]
  ],
  5: [
    [0, 4],
    [4, 9],
    [9, 15],
    [15, 20],
    [20, 25]
  ]
};

function countNarrationWords(scenes) {
  return scenes
    .map((scene) =>
      String(scene.narration ?? "").trim()
    )
    .filter(Boolean)
    .join(" ")
    .split(/\s+/)
    .filter(Boolean)
    .length;
}

function updateSceneTools() {
  const sceneCount =
    currentStoryboard?.scenes?.length ?? 0;

  sceneCountMessage.textContent =
    uiText("review.scene_count", `${sceneCount} scenes in this plan · Minimum 3`, { count: sceneCount, minimum: 3 });

  undoSceneButton.hidden =
    deletedSceneHistory.length === 0;
}

function normalizeSceneTimeline({
  transferCallToAction = false
} = {}) {
  const scenes =
    currentStoryboard.scenes;

  const timeline =
    SCENE_TIMELINES[scenes.length];

  if (!timeline) {
    throw new Error(
      "A video plan must contain between 3 and 5 scenes."
    );
  }

  scenes.forEach((scene, index) => {
    scene.sceneNumber =
      index + 1;

    scene.startSeconds =
      timeline[index][0];

    scene.endSeconds =
      timeline[index][1];

    if (index === 0) {
      scene.role = "hook";
    } else if (index === scenes.length - 1) {
      scene.role = "cta";
    } else if (
      scene.role === "hook" ||
      scene.role === "cta"
    ) {
      scene.role = "benefit";
    }

    scene.approved = false;
  });

  if (transferCallToAction) {
    const finalScene =
      scenes.at(-1);

    const callToAction =
      String(
        currentStoryboard.cta?.text ?? ""
      ).trim();

    if (callToAction) {
      finalScene.caption =
        callToAction.slice(0, 60);

      const narration =
        String(
          finalScene.narration ?? ""
        ).trim();

      if (
        !narration
          .toLowerCase()
          .includes(
            callToAction.toLowerCase()
          )
      ) {
        finalScene.narration =
          `${narration} ${callToAction}.`
            .trim();
      }
    }
  }

  currentStoryboard.totalDurationSeconds =
    25;

  currentStoryboard.narrationWordCount =
    countNarrationWords(scenes);
}

function renderCurrentScenePlan() {
  planScenes.replaceChildren();

  currentStoryboard.scenes.forEach(
    (scene) => {
      scene.narration =
        String(scene.caption ?? "").trim();

      planScenes.append(
        createSceneReviewCard(scene)
      );
    }
  );

  currentStoryboard.narrationWordCount =
    countNarrationWords(
      currentStoryboard.scenes
    );

  updateSceneTools();
  validateVideoPlan();
}

function deleteScene(scene) {
  if (
    currentStoryboard.scenes.length <= 3
  ) {
    planStatus.textContent =
      "A video needs at least 3 scenes.";

    return;
  }

  deletedSceneHistory.push(
    JSON.parse(
      JSON.stringify(
        currentStoryboard.scenes
      )
    )
  );

  const sceneIndex =
    currentStoryboard.scenes.indexOf(
      scene
    );

  if (sceneIndex < 0) {
    return;
  }

  const deletingCallToAction =
    scene.role === "cta";

  currentStoryboard.scenes.splice(
    sceneIndex,
    1
  );

  normalizeSceneTimeline({
    transferCallToAction:
      deletingCallToAction
  });

  renderCurrentScenePlan();

  planStatus.textContent = uiText("review.scene_deleted", `Scene deleted. Review and confirm the remaining ${currentStoryboard.scenes.length} scenes.`, { count: currentStoryboard.scenes.length });
}

function validateVideoPlan() {
  if (window.quickAdMusic.locked) { finalVideoButton.disabled = true; return false; }
  if (!currentStoryboard) {
    finalVideoButton.disabled = true;
    return false;
  }

  const invalidScene =
    currentStoryboard.scenes.find(
      (scene) => {
        const caption =
          String(scene.caption ?? "").trim();

        return (
          caption.length === 0 ||
          caption.length > 60 ||
          !Number.isInteger(scene.imageIndex) ||
          scene.imageIndex < 1 ||
          scene.imageIndex > currentReviewImageCount
        );
      }
    );

  if (invalidScene) {
    finalVideoButton.disabled = true;
    planStatus.textContent = uiText("review.invalid_scene", `Scene ${invalidScene.sceneNumber} needs a valid picture and a caption containing 1-60 characters.`, { number: invalidScene.sceneNumber });

    return false;
  }

  const approvedCount =
    currentStoryboard.scenes.filter(
      (scene) => scene.approved === true
    ).length;

  const totalScenes =
    currentStoryboard.scenes.length;

  if (approvedCount !== totalScenes) {
    finalVideoButton.disabled = true;
    planStatus.textContent = uiText("review.approval_progress", `${approvedCount} of ${totalScenes} scenes approved. Confirm every scene to create the final video.`, { approved: approvedCount, total: totalScenes });

    return false;
  }

  finalVideoButton.disabled = false;
  planStatus.textContent =
    uiText("review.all_approved", `All ${totalScenes} scenes are approved. You can now create the final video.`, { total: totalScenes });

  return true;
}
function createSceneReviewCard(scene) {
  const card = document.createElement("article");
  card.className = "scene-review-card";

  const sceneHeader = document.createElement("div");
  sceneHeader.className = "scene-review-header";

  const sceneIdentity = document.createElement("div");

  const sceneNumber = document.createElement("span");
  sceneNumber.className = "scene-review-number";
  sceneNumber.textContent =
    String(scene.sceneNumber);

  const sceneHeading = document.createElement("div");

  const sceneTitle = document.createElement("strong");
  sceneTitle.textContent = uiText("scene.title", `Scene ${scene.sceneNumber}`, { number: scene.sceneNumber });

  const sceneTiming = document.createElement("small");
  sceneTiming.textContent = uiText("scene.timing", `${scene.startSeconds}-${scene.endSeconds} seconds - ${scene.role}`, { start: scene.startSeconds, end: scene.endSeconds, role: roleText(scene.role) });

  sceneHeading.append(
    sceneTitle,
    sceneTiming
  );

  sceneIdentity.append(
    sceneNumber,
    sceneHeading
  );

  const approvalBadge =
    document.createElement("span");

  approvalBadge.className =
    "scene-approval-badge";

  approvalBadge.textContent =
    window.QuickAdI18n?.t("scene.ai_suggested") || "AI suggested";

  const sceneHeaderActions =
    document.createElement("div");

  sceneHeaderActions.className =
    "scene-header-actions";

  const deleteSceneButton =
    document.createElement("button");

  deleteSceneButton.type = "button";
  deleteSceneButton.className =
    "delete-scene-button";

  deleteSceneButton.textContent =
    window.QuickAdI18n?.t("scene.delete") || "Delete Scene";

  deleteSceneButton.disabled =
    currentStoryboard.scenes.length <= 3;

  deleteSceneButton.title = deleteSceneButton.disabled ? uiText("scene.minimum_title", "A video must retain at least 3 scenes.") : uiText("scene.remove_title", "Remove this scene from the video.");

  deleteSceneButton.addEventListener(
    "click",
    () => {
      deleteScene(scene);
    }
  );

  sceneHeaderActions.append(
    approvalBadge,
    deleteSceneButton
  );

  sceneHeader.append(
    sceneIdentity,
    sceneHeaderActions
  );

  const sceneBody = document.createElement("div");
  sceneBody.className = "scene-review-body";

  const pictureColumn = document.createElement("div");
  pictureColumn.className = "scene-picture-column";

  const pictureFrame = document.createElement("div");
  pictureFrame.className = "scene-picture-frame";

  const picture = document.createElement("img");
  picture.alt = uiText("scene.picture_alt", `Picture assigned to scene ${scene.sceneNumber}`, { number: scene.sceneNumber });

  picture.src =
    reviewImageUrls[scene.imageIndex - 1] ||
    "";

  pictureFrame.append(picture);

  const pictureLabel = document.createElement("label");
  pictureLabel.textContent = window.QuickAdI18n?.t("scene.picture") || "Picture";

  const pictureSelect =
    document.createElement("select");

  pictureSelect.className =
    "scene-picture-select";

  pictureSelect.setAttribute("aria-label", uiText("scene.picture_for", `Picture for scene ${scene.sceneNumber}`, { number: scene.sceneNumber }));

  reviewImageUrls.forEach(
    (_imageUrl, imageIndex) => {
      const option =
        document.createElement("option");

      option.value =
        String(imageIndex + 1);

      const uploadedFileName =
        selectedImages[
          imageIndex
        ]?.name;

      option.textContent = uploadedFileName ? uiText("scene.picture_named", `Picture ${imageIndex + 1}: ${uploadedFileName}`, { number: imageIndex + 1, name: uploadedFileName }) : uiText("scene.picture_number", `Picture ${imageIndex + 1}`, { number: imageIndex + 1 });

      option.selected =
        imageIndex + 1 ===
        scene.imageIndex;

      pictureSelect.append(option);
    }
  );

  pictureSelect.addEventListener(
    "change",
    () => {
      const imageIndex =
        Number(pictureSelect.value);

      scene.imageIndex =
        imageIndex;

      picture.src =
        reviewImageUrls[imageIndex - 1] ||
        "";

      scene.approved = false;

      updateSceneApprovalState();

      validateVideoPlan();
    }
  );

  pictureLabel.append(pictureSelect);

  pictureColumn.append(
    pictureFrame,
    pictureLabel
  );

  const captionColumn = document.createElement("div");
  captionColumn.className = "scene-caption-column";

  const captionLabel = document.createElement("label");
  captionLabel.textContent = window.QuickAdI18n?.t("scene.ai_caption") || "AI caption";

  const captionInput =
    document.createElement("textarea");

  captionInput.className =
    "scene-caption-input";

  captionInput.rows = 2;
  captionInput.maxLength = 60;
  captionInput.value =
    scene.caption;

  captionInput.setAttribute("aria-label", uiText("scene.caption_for", `Caption for scene ${scene.sceneNumber}`, { number: scene.sceneNumber }));

  const captionMeta = document.createElement("div");
  captionMeta.className = "scene-caption-meta";

  const captionAdvice =
    document.createElement("span");

  captionAdvice.textContent = uiText("scene.caption_advice", "Recommended: 3–8 words · Maximum: 60 characters");

  const captionCounter =
    document.createElement("span");

  captionCounter.textContent = uiText("scene.caption_count", `${captionInput.value.length} / 60 characters`, { count: captionInput.value.length, max: 60 });

  captionInput.addEventListener(
    "input",
    () => {
      scene.caption =
        captionInput.value;

      scene.narration =
        captionInput.value.trim();

      narrationText.textContent =
        scene.narration;

      currentStoryboard.narrationWordCount =
        countNarrationWords(
          currentStoryboard.scenes
        );

      captionCounter.textContent = uiText("scene.caption_count", `${captionInput.value.length} / 60 characters`, { count: captionInput.value.length, max: 60 });

      captionCounter.classList.toggle(
        "limit-warning",
        captionInput.value.length > 55
      );

      scene.approved = false;

      updateSceneApprovalState();

      validateVideoPlan();
    }
  );

  captionMeta.append(
    captionAdvice,
    captionCounter
  );

  const narrationLabel =
    document.createElement("span");

  narrationLabel.className =
    "scene-narration-label";

  narrationLabel.textContent =
    window.QuickAdI18n?.t("scene.narration_preview") || "Narration preview";

  const narrationText =
    document.createElement("p");

  narrationText.className =
    "scene-narration-text";

  narrationText.textContent =
    scene.narration;

  captionLabel.append(
    captionInput,
    captionMeta
  );

  captionColumn.append(
    captionLabel,
    narrationLabel,
    narrationText
  );

  sceneBody.append(
    pictureColumn,
    captionColumn
  );

  const sceneApprovalActions =
    document.createElement("div");

  sceneApprovalActions.className =
    "scene-approval-actions";

  const confirmSceneButton =
    document.createElement("button");

  confirmSceneButton.type = "button";
  confirmSceneButton.className =
    "confirm-scene-button";

  function updateSceneApprovalState() {
    if (scene.approved === true) {
      approvalBadge.textContent =
        window.QuickAdI18n?.t("scene.approved") || "Scene approved";

      approvalBadge.classList.add(
        "approved"
      );

      confirmSceneButton.textContent =
        `✓ ${uiText("scene.approved", "Scene approved")}`;

      confirmSceneButton.classList.add(
        "approved"
      );
    } else {
      approvalBadge.textContent =
        window.QuickAdI18n?.t("scene.needs_approval") || "Needs approval";

      approvalBadge.classList.remove(
        "approved"
      );

      confirmSceneButton.textContent =
        window.QuickAdI18n?.t("scene.confirm") || "Confirm Scene";

      confirmSceneButton.classList.remove(
        "approved"
      );
    }
  }

  confirmSceneButton.addEventListener(
    "click",
    () => {
      const caption =
        String(scene.caption ?? "").trim();

      const validScene =
        caption.length > 0 &&
        caption.length <= 60 &&
        Number.isInteger(scene.imageIndex) &&
        scene.imageIndex >= 1 &&
        scene.imageIndex <= currentReviewImageCount;

      if (!validScene) {
        scene.approved = false;

        updateSceneApprovalState();
        validateVideoPlan();

        return;
      }

      scene.caption = caption;
      scene.narration = caption;
      captionInput.value = caption;
      narrationText.textContent =
        scene.narration;

      currentStoryboard.narrationWordCount =
        countNarrationWords(
          currentStoryboard.scenes
        );

      scene.approved = true;

      updateSceneApprovalState();
      validateVideoPlan();
    }
  );

  sceneApprovalActions.append(
    confirmSceneButton
  );

  captionColumn.append(
    sceneApprovalActions
  );

  updateSceneApprovalState();

  card.append(
    sceneHeader,
    sceneBody
  );

  return card;
}

function renderVideoPlanReview(
  project,
  storyboard,
  savedImageUrls = null
) {
  clearReviewImageUrls();
  window.quickAdMusic.restore(project.storyboard?.musicChoice ?? "none", project.status === "video_ready", project.storyboard?.musicVolume);

  reviewImageUrls =
    Array.isArray(savedImageUrls)
      ? [...savedImageUrls]
      : selectedImages.map(
          (file) =>
            URL.createObjectURL(file)
        );

  currentReviewImageCount =
    reviewImageUrls.length;

  currentProjectId =
    project.id;

  currentStoryboard =
    JSON.parse(
      JSON.stringify(storyboard)
    );

  currentStoryboard.scenes.forEach(
    (scene) => {
      scene.approved = false;
    }
  );

  deletedSceneHistory.length = 0;

  planReview.hidden = false;
  renderCurrentScenePlan();
}

undoSceneButton.addEventListener(
  "click",
  () => {
    const previousScenes =
      deletedSceneHistory.pop();

    if (!previousScenes) {
      return;
    }

    currentStoryboard.scenes =
      previousScenes;

    currentStoryboard.scenes.forEach(
      (scene) => {
        scene.approved = false;
      }
    );

    currentStoryboard.narrationWordCount =
      countNarrationWords(
        currentStoryboard.scenes
      );

    renderCurrentScenePlan();

    planStatus.textContent = uiText("review.scene_restored", `Deleted scene restored. Review and confirm all ${currentStoryboard.scenes.length} scenes.`, { count: currentStoryboard.scenes.length });
  }
);

narratorOptions.forEach((option) => {
  option.addEventListener(
    "change",
    () => {
      planStatus.textContent =
        `Narrator selected: ${selectedNarratorVoice().replaceAll("-", " ")}.`;

      validateVideoPlan();
    }
  );
});

finalVideoButton.addEventListener(
  "click",
  async () => {
    if (!validateVideoPlan()) {
      planStatus.scrollIntoView({
        behavior: "smooth",
        block: "center"
      });

      return;
    }

    window.quickAdMusic.lock("busy");
    const originalButtonText =
      finalVideoButton.textContent;

    finalVideoButton.disabled = true;
    finalVideoButton.textContent =
      uiText("review.final_btn_creating", "Creating Final Video...");

    planStatus.classList.remove(
      "approved"
    );

    planStatus.textContent =
      uiText("result.generating_desc", "Generating your selected AI narration and rendering the final MP4. This may take about one minute.");

    try {
      const finalStoryboard = {
        ...currentStoryboard,
        scenes:
          currentStoryboard.scenes.map(
            (scene) => {
              const {
                approved: _approved,
                ...validatedScene
              } = scene;

              return validatedScene;
            }
          )
      };

      const response = await quickAdProjectFetch(
        `/api/projects/${currentProjectId}/finalize`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json"
          },
          body: JSON.stringify({
            storyboard:
              finalStoryboard,
            musicChoice: window.quickAdMusic.value,
            musicVolume: window.quickAdMusic.volume,
            narratorChoice:
              selectedNarratorVoice()
          })
        }
      );

      const result =
        await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(
          localizedApiError(result) ||
          "The final video could not be created."
        );
      }

      window.quickAdMusic.lock("ready");
      finalVideoButton.textContent =
        uiText("result.video_ready", "Video Ready"); try{ updateQuota(); }catch(e){} try{ loadAccountProjects(); }catch(e){} // auto-refresh quota ✓";

      rememberProject(
        {
          id:
            currentProjectId,
          status:
            "video_ready"
        },
        currentStoryboard,
        "video_ready"
      );

      planStatus.classList.add(
        "approved",
        "video-result-card"
      );

      const resultHeading =
        document.createElement("strong");

      resultHeading.className =
        "video-result-heading";

      resultHeading.textContent =
        uiText("result.final_ready", "Your final video is ready");

      const resultSummary =
        document.createElement("span");

      resultSummary.className =
        "video-result-summary";

      resultSummary.textContent =
        uiText("result.summary_complete", `${currentStoryboard.scenes.length} scenes · 25-second MP4 · AI narration complete`, { count: currentStoryboard.scenes.length });

      const resultActions =
        document.createElement("span");

      resultActions.className =
        "video-result-actions";

      const watchLink =
        document.createElement("a");

      watchLink.href =
        result.videoUrl;

      watchLink.target = "_blank";
      watchLink.rel = "noopener";
      watchLink.className =
        "video-result-link primary";

      watchLink.textContent =
        window.QuickAdI18n?.t("result.watch") || "Watch Video";

      const downloadLink =
        document.createElement("a");

      downloadLink.href =
        result.videoUrl;

      downloadLink.download =
        "quickad-video.mp4";

      downloadLink.className =
        "video-result-link";

      downloadLink.textContent =
        window.QuickAdI18n?.t("result.download") || "Download MP4";

      resultActions.append(
        watchLink,
        downloadLink
      );

      planStatus.replaceChildren(
        resultHeading,
        resultSummary,
        resultActions
      );

      const successMark =
        document.createElement("span");

      successMark.className =
        "success-mark";

      successMark.setAttribute(
        "aria-hidden",
        "true"
      );

      successMark.textContent = "✓";

      const successContent =
        document.createElement("div");

      const successTitle =
        document.createElement("strong");

      successTitle.textContent =
        uiText("result.final_ready", "Your final video is ready");

      const successDetails =
        document.createElement("span");

      successDetails.textContent =
        uiText("result.summary_saved", `${currentStoryboard.scenes.length} scenes · AI narration · 25-second MP4`, { count: currentStoryboard.scenes.length });

      const successNext =
        document.createElement("small");

      successNext.textContent =
        "Your approved video was rendered successfully. Watch or download it below.";

      successContent.append(
        successTitle,
        successDetails,
        successNext
      );

      formMessage.replaceChildren(
        successMark,
        successContent
      );

      formMessage.classList.remove(
        "error"
      );

      formMessage.classList.add(
        "visible",
        "success-card",
        "success-popover"
      );

      window.setTimeout(() => {
        formMessage.classList.remove(
          "success-popover"
        );

        planStatus.scrollIntoView({
          behavior: "smooth",
          block: "center"
        });
      }, 3000);
    } catch (error) {
      window.quickAdMusic.lock("");
      finalVideoButton.disabled = false;
      finalVideoButton.textContent =
        originalButtonText;

      planStatus.classList.remove(
        "approved"
      );

      planStatus.textContent =
        error.message ||
        "The final video could not be created.";
    }

    planStatus.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });
  }
);
function updateCustomCtaField() {
  const customSelected =
    callToActionSelect.value ===
    "custom";

  customCtaField.hidden =
    !customSelected;

  customCtaInput.required =
    customSelected;

  customCtaError.textContent = "";

  if (customSelected) {
    customCtaInput.focus();
  }
}

callToActionSelect.addEventListener(
  "change",
  updateCustomCtaField
);

customCtaInput.addEventListener(
  "input",
  () => {
    customCtaCount.textContent =
      uiText("cta.count", `${customCtaInput.value.length} / 40 characters`, { count: customCtaInput.value.length, max: 40 });

    customCtaError.textContent = "";
  }
);

updateCustomCtaField();

function readProjectHistory() {
  if (!PROJECT_HISTORY_KEY) return [];
  return accountProjectHistory.slice(0, MAX_RECENT_PROJECTS);
}

function writeProjectHistory(history) {
  if (!PROJECT_HISTORY_KEY) return;
  accountProjectHistory = history.slice(0, MAX_RECENT_PROJECTS);
  accountHistoryRevision++;
  try {
    localStorage.setItem(
      PROJECT_HISTORY_KEY,
      JSON.stringify(history.slice(0, MAX_RECENT_PROJECTS))
    );
  } catch {
    // Browser storage failure must not turn successful generation into failure.
    console.warn("Project history could not be saved in this browser.");
  }
}

function removeProjectFromHistory(projectId) {
  const remainingHistory =
    readProjectHistory().filter(
      (entry) =>
        entry.id !== projectId
    );

  writeProjectHistory(
    remainingHistory
  );

  renderRecentProjects();
}

function rememberProject(
  project,
  storyboard = null,
  status = ""
) {
  const projectId =
    String(project?.id ?? "");

  if (
    !PROJECT_ID_PATTERN.test(projectId)
  ) {
    return;
  }

  const existingHistory =
    readProjectHistory();

  const existingEntry =
    existingHistory.find(
      (entry) =>
        entry.id === projectId
    );

  const title =
    String(
      storyboard?.title ??
      project?.storyboard?.title ??
      existingEntry?.title ??
      "Untitled video"
    ).trim() ||
    "Untitled video";

  const resolvedStatus =
    String(
      status ||
      project?.status ||
      existingEntry?.status ||
      "storyboard_ready"
    );

  const historyEntry = {
    id:
      projectId,
    title,
    style:
      String(
        project?.style ??
        existingEntry?.style ??
        ""
      ),
    status:
      resolvedStatus,
    createdAt:
      project?.createdAt ??
      existingEntry?.createdAt ??
      new Date().toISOString(),
    updatedAt:
      new Date().toISOString()
  };

  const nextHistory = [
    historyEntry,
    ...existingHistory.filter(
      (entry) =>
        entry.id !== projectId
    )
  ].slice(0, MAX_RECENT_PROJECTS);

  writeProjectHistory(nextHistory);
  renderRecentProjects();
}

function projectStatusLabel(status) {
  switch (status) {
    case "video_ready":
      return window.QuickAdI18n?.t("status.video_ready") || "Video ready";

    case "storyboard_ready":
      return window.QuickAdI18n?.t("status.plan_ready") || "Plan ready";

    case "narration_failed":
    case "video_failed":
    case "storyboard_failed":
      return "Needs attention";

    default:
      return uiText("status.saved_project", "Saved project");
  }
}

function formatProjectDate(value) {
  const date =
    new Date(value);

  if (
    Number.isNaN(date.getTime())
  ) {
    return "";
  }

  return new Intl.DateTimeFormat(
    undefined,
    {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit"
    }
  ).format(date);
}

async function deleteSavedProject(entry, button) {
  const warning = `Permanently delete "${entry.title}"? This removes its uploaded images, narration, video and render files. Download anything you want to keep first. This cannot be undone.`;
  if (!window.confirm(warning + (entry.id === currentProjectId ? " The current page will reload and unsaved edits will be discarded." : ""))) return;
  button.disabled = true;
  button.textContent = "Deleting…";
  try {
    const response = await quickAdProjectFetch(`/api/projects/${encodeURIComponent(entry.id)}`, {method: "DELETE"});
    const data = await response.json();
    if (!response.ok || !data.ok) throw data;
    if (entry.id === currentProjectId) {
      window.location.reload();
      return;
    }
    await loadAccountProjects();
  } catch (error) {
    recentProjectStatus.textContent = localizedApiError(error) || error.message || uiText("recent.delete_failed", "Project deletion failed. Please refresh before retrying.");
    recentProjectStatus.classList.add("error");
  } finally {
    button.disabled = false;
    button.textContent = window.QuickAdI18n?.t("recent.delete") || "Delete";
  }
}

function renderRecentProjects() {
  const history =
    readProjectHistory();

  recentProjectList.replaceChildren();
  recentProjectStatus.textContent = "";
  recentProjectStatus.classList.remove(
    "error"
  );

  recentProjects.hidden =
    history.length === 0;

  if (history.length === 0) {
    return;
  }

  history.forEach((entry) => {
    const card =
      document.createElement("article");

    card.className =
      "recent-project-card";

    const information =
      document.createElement("div");

    information.className =
      "recent-project-info";

    const title =
      document.createElement("strong");

    title.textContent =
      entry.title;

    const details =
      document.createElement("span");

    const detailParts = [
      projectStatusLabel(
        entry.status
      ),
      entry.style,
      formatProjectDate(
        entry.updatedAt ||
        entry.createdAt
      ),
      uiText("recent.project_id", `Project ${entry.id.slice(0, 8)}`, { id: entry.id.slice(0, 8) })
    ].filter(Boolean);

    details.textContent =
      detailParts.join(" · ");

    information.append(
      title,
      details
    );

    const openButton =
      document.createElement("button");

    openButton.type = "button";
    openButton.className =
      "open-recent-project";

    openButton.textContent =
      entry.status === "video_ready"
        ? window.QuickAdI18n?.t("recent.open_video") || "Open Video"
        : window.QuickAdI18n?.t("recent.continue") || "Continue";

    openButton.addEventListener(
      "click",
      () => {
        openSavedProject(
          entry.id,
          openButton
        );
      }
    );

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "delete-recent-project";
    deleteButton.textContent = window.QuickAdI18n?.t("recent.delete") || "Delete";
    deleteButton.setAttribute("aria-label", uiText("recent.delete_project_aria", `Delete project ${entry.title}`, { title: entry.title }));
    deleteButton.addEventListener("click", () => deleteSavedProject(entry, deleteButton));
    const actions = document.createElement("div");
    actions.className = "recent-project-actions";
    actions.append(openButton, deleteButton);
    card.append(information, actions);

    recentProjectList.append(card);
  });
}

function renderRecoveredVideoResult(
  recovery
) {
  currentStoryboard.scenes.forEach(
    (scene) => {
      scene.approved = true;
    }
  );

  renderCurrentScenePlan();

  finalVideoButton.disabled = true;
  finalVideoButton.textContent =
    uiText("result.video_ready_check", "Video Ready ✓");

  planStatus.classList.add(
    "approved",
    "video-result-card"
  );

  const resultHeading =
    document.createElement("strong");

  resultHeading.className =
    "video-result-heading";

  resultHeading.textContent =
    window.QuickAdI18n?.t("result.saved_ready") || "Your saved video is ready";

  const resultSummary =
    document.createElement("span");

  resultSummary.className =
    "video-result-summary";

  resultSummary.textContent =
    uiText("result.scenes_prefix", `${currentStoryboard.scenes.length} scenes · `, { count: currentStoryboard.scenes.length }) +
    uiText("video.mp4_duration", `${currentStoryboard.totalDurationSeconds || 25}-second MP4 · `, { seconds: currentStoryboard.totalDurationSeconds || 25 }) +
    "AI narration complete";

  const resultActions =
    document.createElement("span");

  resultActions.className =
    "video-result-actions";

  const watchLink =
    document.createElement("a");

  watchLink.href =
    recovery.videoUrl;

  watchLink.target = "_blank";
  watchLink.rel = "noopener";
  watchLink.className =
    "video-result-link primary";

  watchLink.textContent =
    window.QuickAdI18n?.t("result.watch") || "Watch Video";

  const downloadLink =
    document.createElement("a");

  downloadLink.href =
    recovery.videoUrl;

  downloadLink.download =
    "quickad-video.mp4";

  downloadLink.className =
    "video-result-link";

  downloadLink.textContent =
    window.QuickAdI18n?.t("result.download") || "Download MP4";

  resultActions.append(
    watchLink,
    downloadLink
  );

  planStatus.replaceChildren(
    resultHeading,
    resultSummary,
    resultActions
  );
}

async function openSavedProject(
  projectId,
  openButton
) {
  const originalButtonText =
    openButton.textContent;

  openButton.disabled = true;
  openButton.textContent =
    "Opening...";

  recentProjectStatus.textContent =
    uiText("saved.opening", "Opening your saved project...");

  recentProjectStatus.classList.remove(
    "error"
  );

  try {
    const response =
      await quickAdProjectFetch(
        `/api/projects/${projectId}`
      );

    const recovery =
      await response.json();

    if (
      !response.ok ||
      !recovery.ok
    ) {
      if (response.status === 404) {
        removeProjectFromHistory(
          projectId
        );
      }

      throw new Error(
        recovery.error ||
        uiText("saved.open_error", "The saved project could not be opened.")
      );
    }

    if (
      !recovery.storyboard ||
      !Array.isArray(
        recovery.storyboard.scenes
      )
    ) {
      throw new Error(
        uiText("saved.no_plan", "This saved project does not have a recoverable video plan.")
      );
    }

    const savedImageUrls =
      Array.isArray(
        recovery.project?.assets
          ?.productImages
      )
        ? recovery.project.assets
            .productImages
            .map(
              (asset) =>
                asset.url
            )
            .filter(Boolean)
        : [];

    if (savedImageUrls.length === 0) {
      throw new Error(
        uiText("saved.no_images", "This saved project does not have recoverable product images.")
      );
    }

    finalVideoButton.textContent =
      uiText("review.final_btn_arrow", "Create Final Video →");

    renderVideoPlanReview(
      recovery.project,
      recovery.storyboard,
      savedImageUrls
    );

    rememberProject(
      recovery.project,
      recovery.storyboard,
      recovery.project.status
    );

    if (
      recovery.stage ===
      "video_ready"
    ) {
      if (!recovery.videoUrl) {
        throw new Error(
          uiText("saved.video_missing", "The saved video file is unavailable.")
        );
      }

      renderRecoveredVideoResult(
        recovery
      );

      recentProjectStatus.textContent =
        uiText("saved.video_opened", "Saved video opened successfully.");
    } else {
      planStatus.textContent = uiText("saved.plan_opened", `Saved plan opened. Review and confirm all ${currentStoryboard.scenes.length} scenes.`, { count: currentStoryboard.scenes.length });

      recentProjectStatus.textContent =
        uiText("saved.plan_opened_success", "Saved video plan opened successfully.");
    }

    planReview.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  } catch (error) {
    recentProjectStatus.textContent =
      error.message ||
      uiText("saved.open_error", "The saved project could not be opened.");

    recentProjectStatus.classList.add(
      "error"
    );
  } finally {
    if (openButton.isConnected) {
      openButton.disabled = false;
      openButton.textContent =
        originalButtonText;
    }
  }
}

clearProjectHistoryButton.textContent = window.QuickAdI18n?.t("recent.refresh") || "Refresh projects";
clearProjectHistoryButton.addEventListener("click", () => {
  loadAccountProjects();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  setUploadError();
  descriptionError.textContent = "";
  formMessage.classList.remove(
    "visible",
    "error",
    "success-card",
    "success-popover"
  );
  formMessage.textContent = "";

  let firstInvalidElement = null;

  if (selectedImages.length === 0) {
    setUploadError(uiText("upload.required_error", "Please add at least one product image."));
    firstInvalidElement = uploadZone;
  }


  if (firstInvalidElement) {
    firstInvalidElement.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });

    if (typeof firstInvalidElement.focus === "function") {
      firstInvalidElement.focus({
        preventScroll: true
      });
    }

    return;
  }

  const originalButtonContent =
    createButton.innerHTML;

  createButton.disabled = true;
  createButton.innerHTML =
    "<span>Creating your video plan...</span><span>•••</span>";

  try {
    syncImageInput();

    const projectData = new FormData(form);
    // Auto-detect UI language for video generation - Phase 2 Mexico
    const userLang = localStorage.getItem('quickad_lang') || document.documentElement.lang || navigator.language || 'en';
    const normalizedLang = userLang.toLowerCase();
    const targetLang = normalizedLang.startsWith("es")
      ? "es-419"
      : normalizedLang.startsWith("pt")
        ? "pt-BR"
        : normalizedLang.startsWith("fr")
          ? "fr"
          : normalizedLang.startsWith("de")
            ? "de"
            : normalizedLang.startsWith("it")
              ? "it"
              : normalizedLang.startsWith("ja")
                ? "ja"
                : normalizedLang.startsWith("ko")
                  ? "ko"
                  : normalizedLang.startsWith("zh")
                    ? "zh"
                    : normalizedLang.startsWith("tr")
                      ? "tr"
                      : "en";
    projectData.set('language', targetLang);
    projectData.set('targetLanguage', targetLang);

    if (
      callToActionSelect.value ===
      "custom"
    ) {
      const customCallToAction =
        customCtaInput.value.trim();

      if (!customCallToAction) {
        customCtaError.textContent = uiText("cta.custom_required", "Enter your call to action.");

        customCtaInput.focus();

        throw new Error(uiText("cta.custom_required_error", "Please enter your custom call to action."));
      }
      projectData.set(
        "callToAction",
        customCallToAction
      );
    } else {
      projectData.set(
        "callToAction",
        getLocalizedCallToAction()
      );
    }

    const response = await quickAdProjectFetch(
      "/api/projects",
      {
        method: "POST",
        body: projectData
      }
    );

    const result = await response.json();

    if (!response.ok || !result.ok) {
      throw new Error(
        localizedApiError(result) ||
        "QuickAd AI could not create the project."
      );
    }

    const shortProjectId =
      result.project.id.slice(0, 8);

    const sceneCount =
      result.storyboard.scenes.length;

    // Record the saved project before rendering its review interface.
    rememberProject(
      result.project,
      result.storyboard,
      result.project.status
    );

    renderVideoPlanReview(
      result.project,
      result.storyboard
    );

    const successMark =
      document.createElement("span");

    successMark.className =
      "success-mark";

    successMark.textContent =
      "✓";

    successMark.setAttribute(
      "aria-hidden",
      "true"
    );

    const successContent =
      document.createElement("span");

    successContent.className =
      "success-content";

    const successTitle =
      document.createElement("strong");

    successTitle.className =
      "success-title";

    successTitle.textContent =
      uiText("review.plan_ready_title", "Your AI video plan is ready");

    const successDetails =
      document.createElement("span");

    successDetails.className =
      "success-details";

    successDetails.textContent =
      uiText("result.project_prefix", `Project ${shortProjectId} • `, { id: shortProjectId }) +
      `"${result.storyboard.title}" • ` +
      `${sceneCount} scenes • ` +
      uiText("video.duration_seconds", `${result.storyboard.totalDurationSeconds} seconds`, { seconds: result.storyboard.totalDurationSeconds });
    const successNext =
      document.createElement("span");

    successNext.className =
      "success-next";

    successNext.textContent =
      uiText("review.generated_desc", "Review the assigned pictures and AI captions before creating narration and video.");

    successContent.append(
      successTitle,
      successDetails,
      successNext
    );

    formMessage.replaceChildren(
      successMark,
      successContent
    );
    formMessage.classList.remove("error");
    formMessage.classList.add(
      "visible",
      "success-card",
      "success-popover"
    );
    window.setTimeout(() => {
      formMessage.classList.remove(
        "success-popover"
      );

      planReview.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }, 3000);
  } catch (error) {
    formMessage.textContent =
      error.message ||
      "QuickAd AI could not create the project.";

    formMessage.classList.add(
      "visible",
      "error"
    );
  } finally {
    createButton.disabled = false;
    createButton.innerHTML =
      originalButtonContent;
  }

  if (
    !formMessage.classList.contains(
      "success-popover"
    )
  ) {
    formMessage.scrollIntoView({
      behavior: "smooth",
      block: "nearest"
    });
  }
});

renderRecentProjects();
renderImagePreviews();


/* Account-scoped history and stale-response protection. */
let quickAdHistoryUser = null;
let quickAdIdentityKnown = false;
let quickAdPageLeaving = false;
const quickAdAuthSignalKey = "quickadAuthChangeV1";

function quickAdReloadPrivatePage() {
  if (quickAdPageLeaving) return;
  quickAdPageLeaving = true;

  // Hide immediately, before navigation finishes.
  document.body.style.visibility = "hidden";
  window.location.reload();
}

window.quickAdAccountChanged = (user) => {
  const nextId = typeof user?.id === "string" ? user.id : null;

  if (quickAdIdentityKnown && nextId !== quickAdHistoryUser) {
    quickAdReloadPrivatePage();
    return;
  }

  quickAdIdentityKnown = true;
  quickAdHistoryUser = nextId;
  PROJECT_HISTORY_KEY = nextId
    ? `quickadAIRecentProjectsV2:${nextId}`
    : null;

  renderRecentProjects();
};

window.quickAdNotifyAccountChange = () => {
  // Contains no identity, credentials, or tokens.
  try {
    localStorage.setItem(quickAdAuthSignalKey, crypto.randomUUID());
  } catch {
    // Storage may be unavailable; focus/session checks remain active.
  }
};

window.addEventListener("storage", (event) => {
  if (event.key === quickAdAuthSignalKey) {
    quickAdReloadPrivatePage();
  }
});

async function quickAdReadSession() {
  const response = await fetch("/api/auth/session", {
    credentials: "same-origin",
    cache: "no-store",
    signal: AbortSignal.timeout(30000)
  });

  if (response.status === 401) return null;

  const data = await response.json();
  if (!response.ok || !data.ok || !data.user?.id) {
    throw new Error("Your session could not be verified. Please try again.");
  }
  return data.user;
}

async function quickAdCheckPageSession() {
  try {
    const user = await quickAdReadSession();
    window.quickAdAccountChanged(user);
    return user;
  } catch (error) {
    // Do not continue showing private content with an uncertain identity.
    if (quickAdHistoryUser) quickAdReloadPrivatePage();
    throw error;
  }
}

async function quickAdProjectFetch(url, options = {}) {
  const user = await quickAdCheckPageSession();

  if (quickAdPageLeaving) {
    throw new Error(uiText("account.changed_reload", "Account changed. Reloading."));
  }

  if (!user) {
    throw new Error(uiText("account.sign_in_required", "Please sign in using the Account button first."));
  }

  const requestUserId = user.id;
  const response = await fetch(url, {
    ...options,
    credentials: "same-origin",
    cache: "no-store"
  });

  // Delay delivery to existing UI code until identity is checked again.
  const data = await response.json();
  const currentUser = await quickAdCheckPageSession();

  if (
    quickAdPageLeaving ||
    currentUser?.id !== requestUserId ||
    response.status === 401
  ) {
    quickAdReloadPrivatePage();
    throw new Error(uiText("account.session_changed", "Your account session changed. Reloading."));
  }

  return {
    ok: response.ok,
    status: response.status,
    async json() {
      if (quickAdPageLeaving || quickAdHistoryUser !== requestUserId) {
        throw new Error(uiText("account.changed_reload", "Account changed. Reloading."));
      }
      return data;
    }
  };
}

quickAdCheckPageSession()
  .then((user) => {
    if (user && !quickAdPageLeaving) return loadAccountProjects();
  })
  .catch(() => {
    recentProjects.hidden = false;
    recentProjectStatus.textContent =
      uiText("account.session_unavailable", "Session unavailable. Open Account to try again.");
  });

window.addEventListener("focus", () => {
  if (!quickAdPageLeaving) {
    quickAdCheckPageSession().catch(() => {});
  }
});

window.addEventListener("pageshow", (event) => {
  if (event.persisted) quickAdReloadPrivatePage();
});


async function loadAccountProjects() {
  if (quickAdPageLeaving) return;

  const requestNumber = ++accountListRequest;
  const revision = accountHistoryRevision;
  const historyKey = PROJECT_HISTORY_KEY;

  if (!historyKey) {
    recentProjects.hidden = false;
    recentProjectStatus.textContent = window.QuickAdI18n?.t("recent.sign_in") || "Sign in to see your saved projects.";
    return;
  }

  clearProjectHistoryButton.disabled = true;
  recentProjects.hidden = false;
  recentProjectStatus.textContent = window.QuickAdI18n?.t("recent.loading") || "Loading your saved projects...";

  try {
    const response = await quickAdProjectFetch("/api/projects");
    const data = await response.json();

    if (
      quickAdPageLeaving ||
      requestNumber !== accountListRequest ||
      historyKey !== PROJECT_HISTORY_KEY
    ) return;

    if (!response.ok || !data.ok || !Array.isArray(data.projects)) {
      throw new Error("Your project list could not be loaded.");
    }

    // Do not overwrite a project added while this request was running.
    if (revision !== accountHistoryRevision) return;

    const projects = data.projects.filter(
      entry => entry && PROJECT_ID_PATTERN.test(String(entry.id ?? ""))
    );

    writeProjectHistory(projects);
    renderRecentProjects();

    if (projects.length === 0) {
      recentProjects.hidden = false;
      recentProjectStatus.textContent =
        window.QuickAdI18n?.t("recent.empty") || "No saved projects in this account yet.";
    }
  } catch (error) {
    if (!quickAdPageLeaving && historyKey === PROJECT_HISTORY_KEY) {
      recentProjects.hidden = false;
      recentProjectStatus.textContent =
        error.message || window.QuickAdI18n?.t("recent.error") || "Project list unavailable. Click Refresh projects to retry.";
    }
  } finally {
    if (!quickAdPageLeaving && requestNumber === accountListRequest) {
      clearProjectHistoryButton.disabled = false;
    }
  }
}

// Update the old browser-only description without changing saved files.
for (const paragraph of recentProjects.querySelectorAll("p")) {
  if (paragraph.textContent.trim() ===
      "Projects created in this browser appear here.") {
    paragraph.textContent =
      window.QuickAdI18n?.t("recent.desc") || "Your 10 most recent saved projects in this account appear here.";
  }
}

window.addEventListener('load', updateQuota);
setTimeout(updateQuota, 1000);




// --- AUTO-REFRESH QUOTA AFTER VIDEO READY (patched) ---
(function(){
  const origFetch = window.fetch;
  window.fetch = async function(...args){
    const res = await origFetch.apply(this, args);
    try{
      const url = String(args[0]||'');
      if(url.includes('/finalize') && res.status===201){
        setTimeout(()=>{ try{ updateQuota(); }catch(e){} try{ loadAccountProjects(); }catch(e){} }, 800);
      }
    }catch(e){}
    return res;
  };
})();

async function updateQuota(){
  const banner = document.getElementById('quotaBanner');
  if(!banner) return;
  const isEs = (window.QuickAdI18n?.currentLang === 'es') || (localStorage.getItem('quickad_lang') === 'es');
  try{
    const res = await fetch('/api/quota');
    let remaining = 5, limit = 5, projects = 0;
    if(res.ok){
      const d = await res.json();
      remaining = d.remaining?? d.freeVideosLeft?? 5;
      limit = d.limit?? d.freeLimit?? 5;
      projects = d.projects?? d.projectsCount?? d.totalProjects?? 0;
    } else {
      // fallback to local project count from DOM
      projects = document.querySelectorAll('[data-project-id],.project-card,.recent-project').length;
      // try count from Proyectos Recientes section
      const recent = document.querySelectorAll('#recentProjects > div, #recentProjects.project-item');
      if(recent.length) projects = recent.length;
    }
    // If projects still 0, count from localStorage or API /api/projects
    try{
      const pRes = await fetch('/api/projects');
      if(pRes.ok){
        const pData = await pRes.json();
        if(Array.isArray(pData)) projects = pData.length;
        else if(pData.projects) projects = pData.projects.length;
        else if(pData.count) projects = pData.count;
      }
    }catch{}

    banner.innerHTML = isEs
     ? `🎬 Videos gratis: Te quedan <b>${remaining}</b> de ${limit} • 📁 Proyectos guardados: <b>${projects}</b>`
      : uiText("quota.banner_html", "🎬 Free videos: <b>{remaining}</b> of {limit} left • 📁 Saved projects: <b>{projects}</b>", { remaining, limit, projects });
    banner.style.display='block';
    banner.style.background='linear-gradient(90deg,#EEF2FF,#F5F3FF)';
    banner.style.borderBottom='1px solid #DDD6FE';
    banner.style.padding='10px';
    banner.style.textAlign='center';
    banner.style.fontSize='13px';
    banner.style.fontWeight='600';
    banner.style.color='#4338CA';
  }catch(e){
    console.warn('quota error', e);
    const fallbackProjects = document.querySelectorAll('#recentProjects > div').length || 0;
    banner.innerHTML = isEs
     ? `🎬 Videos gratis: <b>5</b> de <b>5</b> • 📁 Proyectos guardados: <b>${fallbackProjects}</b>`
      : uiText("quota.banner_fallback_html", "🎬 Free videos: <b>5</b> of <b>5</b> • 📁 Saved projects: <b>{projects}</b>", { projects: fallbackProjects });
    banner.style.display='block';
  }
}
// Run on load + after projects load
document.addEventListener('DOMContentLoaded', ()=>{ setTimeout(updateQuota, 500); });
window.addEventListener('load', ()=>{ setTimeout(updateQuota, 1000); });
if(typeof window.refreshProjects === 'function'){
  const _origRefresh = window.refreshProjects;
  window.refreshProjects = async function(...args){ const r = await _origRefresh(...args); updateQuota(); return r; };
}


function translatePageToSpanish(){
  const dict = {
    "Upload your photos, describe what you are promoting, and receive a ready-to-post vertical video.": "Sube tus fotos, describe lo que promocionas y recibe un video vertical listo para publicar.",
    "Your 10 most recent saved projects in this account appear here.": "Tus 10 proyectos guardados más recientes aparecerán aquí.",
    "Tell us what you're promoting": "Cuéntanos qué promocionas"
  };
  document.body.innerHTML = Object.keys(dict).reduce((html,key)=> html.replace(key, dict[key]), document.body.innerHTML);
}


window.addEventListener("quickad:languagechange", () => {
  renderImagePreviews();
  if (currentStoryboard) {
    renderCurrentScenePlan();
    validateVideoPlan();
  }
  renderRecentProjects();
  updateQuota();
});
function getLocalizedCallToAction() {
  const selectedValue = callToActionSelect?.value || "Shop Now";
  if (selectedValue === "custom") {
    return customCtaInput?.value.trim() || "";
  }

  const ctaKeys = {
    "Shop Now": "cta.shop",
    "Learn More": "cta.learn",
    "Order Today": "cta.order",
    "Visit Our Website": "cta.visit",
    "Book Now": "cta.book"
  };

  return uiText(ctaKeys[selectedValue] || "cta.shop", selectedValue);
}
function roleText(role) {
  const normalized = String(role || "").trim().toLowerCase();
  return uiText(`scene.role.${normalized}`, role || "");
}
function localizedApiError(result) {
  if (result?.code === "PROJECT_DELETE_BLOCKED") {
    return uiText("recent.delete_blocked", "This project is still processing or needs review. It cannot be deleted yet.");
  }

  if (result?.code === "FREE_VIDEO_LIMIT_REACHED") {
    return uiText("quota.free_limit_reached", "You have used your 2 free videos. Upgrade to create more videos. Your existing videos and previews remain available.");
  }

  return result?.error || "";
}
