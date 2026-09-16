export function usesCharacterBasedSceneEditLimit(
  text
) {
  const value =
    String(text ?? "");

  const cjkCount =
    (
      value.match(
        /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu
      ) || []
    ).length;

  const letterNumberCount =
    (
      value.match(/[\p{L}\p{N}]/gu) || []
    ).length;

  return (
    letterNumberCount > 0 &&
    cjkCount / letterNumberCount >= 0.5
  );
}

export function countSceneEditUnits(
  value,
  characterBased
) {
  const text =
    String(value ?? "");

  if (characterBased) {
    return (
      text.match(/[\p{L}\p{N}]/gu) || []
    ).length;
  }

  return text
    .trim()
    .split(/\s+/u)
    .filter(Boolean)
    .length;
}

export function findSceneExceedingAiOriginal({
  originalScenes,
  editedScenes
}) {
  const originalScenesByNumber =
    new Map(
      originalScenes.map(
        (scene) => [
          Number(scene.sceneNumber),
          scene
        ]
      )
    );

  return (
    editedScenes.find(
      (scene) => {
        const originalScene =
          originalScenesByNumber.get(
            Number(scene.sceneNumber)
          );

        if (!originalScene) {
          return true;
        }

        const originalNarration =
          String(
            originalScene.narration ?? ""
          );

        const characterBased =
          usesCharacterBasedSceneEditLimit(
            originalNarration
          );

        return (
          countSceneEditUnits(
            scene.narration,
            characterBased
          ) >
          countSceneEditUnits(
            originalNarration,
            characterBased
          )
        );
      }
    ) || null
  );
}
