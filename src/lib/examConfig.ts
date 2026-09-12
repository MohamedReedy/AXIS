export interface ExamConfig {
  showScoreToStudent: boolean;
  instructionsText: string;
}

export function parseExamConfig(instructions?: string | null): ExamConfig {
  if (!instructions) {
    return { showScoreToStudent: true, instructionsText: "" };
  }

  // Check for embedded JSON tag <!--CONFIG:{"show_score_to_student":false}-->
  const match = instructions.match(/<!--CONFIG:(.*?)-->/);
  if (match) {
    try {
      const data = JSON.parse(match[1]);
      return {
        showScoreToStudent: data.show_score_to_student !== false,
        instructionsText: instructions.replace(/<!--CONFIG:.*?-->/g, "").trim(),
      };
    } catch {}
  }

  // Check if entire string is JSON
  if (instructions.trim().startsWith("{") && instructions.trim().endsWith("}")) {
    try {
      const data = JSON.parse(instructions);
      return {
        showScoreToStudent: data.show_score_to_student !== false,
        instructionsText: data.instructions_text || data.instructions || "",
      };
    } catch {}
  }

  return { showScoreToStudent: true, instructionsText: instructions };
}

export function serializeExamConfig(instructionsText: string, showScoreToStudent: boolean): string {
  const cleanText = (instructionsText || "").replace(/<!--CONFIG:.*?-->/g, "").trim();
  if (showScoreToStudent) {
    return cleanText;
  }
  return (cleanText + "\n<!--CONFIG:{\"show_score_to_student\":false}-->").trim();
}
