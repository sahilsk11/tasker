export type TaskActionId =
  | "breakdown"
  | "code_review"
  | "implement"
  | "investigate"
  | "plan";

export type TaskAction = {
  readonly description: string;
  readonly id: TaskActionId;
  readonly isRecommended: boolean;
  readonly label: string;
  readonly prompt: string;
};
