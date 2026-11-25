import { pipeline } from "@huggingface/transformers";
import type { TaskMemoryEmbeddingProvider } from "../domain/task-memory-search.js";

export const LOCAL_TASK_MEMORY_EMBEDDING_MODEL = "Xenova/bge-small-en-v1.5";

type FeatureExtractor = (
  texts: readonly string[],
  options: { readonly normalize: true; readonly pooling: "mean" }
) => Promise<{ readonly tolist: () => number[] | number[][] }>;

export class LocalTaskMemoryEmbeddings implements TaskMemoryEmbeddingProvider {
  public readonly model = LOCAL_TASK_MEMORY_EMBEDDING_MODEL;
  private extractor: Promise<FeatureExtractor> | null = null;

  public async embed(texts: readonly string[]): Promise<readonly Float32Array[]> {
    if (texts.length === 0) {
      return [];
    }
    const extractor = await this.loadExtractor();
    const output = await extractor(texts, { normalize: true, pooling: "mean" });
    const values = output.tolist();
    const vectors =
      values.length > 0 && Array.isArray(values[0])
        ? (values as number[][])
        : [values as number[]];
    return vectors.map((vector) => Float32Array.from(vector));
  }

  private loadExtractor(): Promise<FeatureExtractor> {
    this.extractor ??= pipeline("feature-extraction", this.model, {
      dtype: "q8"
    }).then((extractor) => extractor as unknown as FeatureExtractor);
    return this.extractor;
  }
}
