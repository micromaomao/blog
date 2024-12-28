import React from "react";
import { Link } from "@fluentui/react-link";
import { Button } from "@fluentui/react-button";
import { Combobox, Option } from "@fluentui/react-combobox";
import { Field } from "@fluentui/react-field";
import { Skeleton, SkeletonItem } from "@fluentui/react-skeleton";
import { Textarea } from "@fluentui/react-textarea";
import { Body2 } from "@fluentui/react-text";
import { ProgressBar } from "@fluentui/react-progress";
import { MessageBar, MessageBarBody, MessageBarTitle, MessageBarActions } from "@fluentui/react-message-bar";
import { DeleteRegular, AddCircleRegular } from "@fluentui/react-icons";
import { PureComponent, createContext, createRef, useContext, useEffect, useState } from "react";
import type { RefObject } from "react";

import styles from "./embeddings.module.css";
import { norm, dot } from "./vectools";

import precached_results from "./precached_results.json";
let embeddings_cache: Record<string, Map<string, number[]>> = {};
for (let pc of precached_results) {
  if (!embeddings_cache[pc.model]) {
    embeddings_cache[pc.model] = new Map();
  }
  embeddings_cache[pc.model].set(pc.text, pc.embedding);
}

const setBestMatchHighlightContext = createContext<any>(null);

export default function EmbeddingsTest({ available_models }: { available_models: string[] }) {
  const initialInputs = precached_results.map(r => r.text);
  const initialModel = precached_results[0].model;
  const [inputs, setInputs] = useState<string[]>(initialInputs);
  const [model, setModel] = useState<string>(initialModel);
  const handleSelectModel = (_: any, { optionText }: any) => {
    if (optionText) {
      setModel(optionText);
      setBestMatchHighlight(null);
    }
  };
  const handleInputModel = (evt: any) => {
    setModel((evt.target as HTMLInputElement).value);
    setBestMatchHighlight(null);
  };
  const [showValidation, setShowValidation] = useState<boolean>(false);
  const inputsValid = inputs.map(ipt => ipt.length > 0);
  const modelValid = model.length > 0;
  const formValid = inputsValid.every(x => x) && inputs.length > 0 && modelValid;
  const [currentResultInput, setCurrentResultInput] = useState<any>({ inputs: initialInputs, model: initialModel });
  const [bestMatchHighlight, setBestMatchHighlight] = useState<number | null>(null);
  const handleSubmit = () => {
    setShowValidation(true);
    if (!formValid) {
      return;
    }
    setCurrentResultInput({ inputs, model });
  };
  const updateInput = (idx: number, value: string) => {
    const newInputs = [...inputs];
    newInputs[idx] = value;
    setInputs(newInputs);
    setBestMatchHighlight(null);
  };
  const addInput = () => {
    setInputs([...inputs, ""]);
    setShowValidation(false);
    setBestMatchHighlight(null);
  };
  const removeInput = (idx: number) => {
    setInputs(inputs.filter((_, i) => i !== idx));
    setBestMatchHighlight(null);
  };
  return (
    <>
      {inputs.map((input, idx) => (
        <Field key={idx}
          className={styles.inputField + (idx === bestMatchHighlight ? (" " + styles.bestMatch) : "")}
          label={`Input ${idx + 1}`}
          required={true}
          validationMessage={(showValidation && !inputsValid[idx]) ? `Input ${idx + 1} must not be empty` : undefined}
        >
          <div className={styles.inputRow + (idx === 0 ? (" " + styles.inputRowNoRemove) : "")} key={idx}>
            <Textarea
              resize="vertical"
              value={input}
              // style={{width: "100%"}}
              onChange={(_, data) => updateInput(idx, data.value)}
              appearance={idx === bestMatchHighlight ? "filled-lighter" : undefined}
            />
            {idx > 0 ? (
              <Button className={styles.removeInputBtn} appearance="transparent" onClick={() => removeInput(idx)} icon={<DeleteRegular />} />
            ) : null}
          </div>
        </Field>
      ))}
      <div style={{ height: "8px" }} />
      {inputs.length < 30 ? (
        <Button appearance="secondary" onClick={addInput} icon={<AddCircleRegular />}>
          Add input
        </Button>) : null}
      <div style={{ height: "16px" }} />
      <Field label="Model" required={true}
        validationMessage={(showValidation && !modelValid ? "Select or input a model" : undefined)}>
        <Combobox
          freeform={true}
          defaultSelectedOptions={[model]}
          defaultValue={model}
          onOptionSelect={handleSelectModel}
          onInput={handleInputModel}>
          {available_models.map(model => (
            <Option value={model} key={model}>
              {model}
            </Option>
          ))}
        </Combobox>
      </Field>
      <div style={{ height: "16px" }}></div>
      <Button appearance="primary" onClick={handleSubmit}>Get embeddings</Button>
      {currentResultInput ? (
        <>
          <div style={{ height: "16px" }}></div>
          <setBestMatchHighlightContext.Provider value={setBestMatchHighlight}>
            <EmbeddingsResult {...currentResultInput} />
          </setBestMatchHighlightContext.Provider>
        </>
      ) : null}
    </>
  );
}

class ResponseError extends Error {
  constructor(message: string) {
    super(message);
  }
  override toString(): string {
    return this.message;
  }
}

const PROXY_ENDPOINT = process.env.BACKEND_ENDPOINT;

async function fetchEmbeddingsSingle(input: string, model: string, signal: AbortSignal): Promise<any> {
  if (embeddings_cache[model]?.has(input)) {
    return { embedding: embeddings_cache[model].get(input) };
  }
  let res = await fetch(new URL("/openai/v1/embeddings", PROXY_ENDPOINT), {
    method: "POST",
    body: JSON.stringify({ input, model }),
    headers: {
      "Content-Type": "application/json"
    }
  });
  if (!res.ok) {
    let err_msg;
    if (res.headers.get("content-type")?.startsWith("application/json")) {
      err_msg = (await res.json()).error?.message ?? "Unknown error";
    } else {
      err_msg = await res.text();
    }
    throw new Error("Error fetching embeddings: " + err_msg);
  }
  let json = await res.json();
  let embedding = json.data[0].embedding;
  if (!embeddings_cache[model]) {
    embeddings_cache[model] = new Map();
  }
  embeddings_cache[model].set(input, embedding);
  return {
    embedding
  }
}

async function fetchEmbeddingDebugResult(inputs: string[], model: string): Promise<any> {
  const abortController = new AbortController();
  try {
    const embeddings = await Promise.all(inputs.map(async input => {
      const res = await fetchEmbeddingsSingle(input, model, abortController.signal);
      return res.embedding;
    }));
    const norms = embeddings.map(e => norm(e));
    const similarities = [1];
    for (let i = 1; i < embeddings.length; i += 1) {
      similarities.push(dot(embeddings[0], embeddings[i]) / (norms[0] * norms[i]));
    }
    return {
      embeddings, similarities,
    };
  } catch (e) {
    abortController.abort();
    throw e;
  }
}

function useEmbeddingDebugResult(inputs: string[], model: string): { data: any, error: Error, isLoading: boolean, retry: () => void } {
  let [data, setData] = useState<any>(null);
  let [error, setError] = useState<Error>(null);
  let [isLoading, setIsLoading] = useState<boolean>(true);
  let [retryCount, setRetryCount] = useState<number>(0);
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    fetchEmbeddingDebugResult(inputs, model).then(res => {
      if (cancelled) return;
      setIsLoading(false);
      setData(res);
      setError(null);
    }, err => {
      if (cancelled) return;
      setIsLoading(false);
      setError(err);
    });
    return () => {
      cancelled = true;
    };
  }, [model, inputs, retryCount]);
  return {
    data, error, isLoading, retry: () => {
      setRetryCount(retryCount + 1);
      setError(null);
    }
  };
}

function EmbeddingsResult({ inputs, model }: {
  inputs: string[],
  model: string
}) {
  let { data, error, isLoading, retry } = useEmbeddingDebugResult(inputs, model);
  if (typeof data !== "object") {
    data = null;
  }
  if (!data && !error && isLoading) {
    return (
      <Skeleton appearance="opaque">
        <SkeletonItem />
      </Skeleton>
    );
  }

  function handleExportJSON() {
    let objs: any[] = [];
    for (let i = 0; i < inputs.length; i += 1) {
      let text = inputs[i];
      let embedding = data.embeddings[i];
      objs.push({ text, model, embedding });
    }
    const json = JSON.stringify(objs);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1000)
  }

  return (
    <>
      {isLoading ? (
        <ProgressBar as="div" value={undefined} thickness="medium" />
      ) : null}
      {error ? (
        <MessageBar intent="error" layout="multiline">
          <MessageBarBody>
            <MessageBarTitle>Error getting embeddings</MessageBarTitle>
            {error.toString()}
          </MessageBarBody>
          <MessageBarActions containerAction={
            isLoading ? undefined : (<Link onClick={retry}>Retry</Link>)
          }>
          </MessageBarActions>
        </MessageBar>
      ) : null}
      {data ? (
        <>
          <EmbeddingsResultMaps data={data} /><br />
          <Link appearance="subtle" onClick={handleExportJSON}>Export as JSON</Link>
        </>
      ) : null}
    </>
  );
}

function EmbeddingsResultMaps({ data }: { data: any }) {
  let bestMatchI: number | null = null;
  let bestMatchScore = 0;
  for (let i = 1; i < data.similarities.length; i++) {
    if (bestMatchI === null || data.similarities[i] > bestMatchScore) {
      bestMatchI = i;
      bestMatchScore = data.similarities[i];
    }
  }
  const setBestMatchHighlight = useContext(setBestMatchHighlightContext);
  useEffect(() => {
    if (setBestMatchHighlight) {
      setBestMatchHighlight(bestMatchI);
    }
  }, [data]);
  return (
    <div className={styles.embeddingsMapContainer}>
      {data.embeddings.map((embedding: number[], idx: number) => (
        <div key={idx} className={bestMatchI === idx ? styles.bestMatch : ""}>
          <Body2 block={true}>Input {idx + 1}:</Body2>
          <EmbeddingsBar embeddings={embedding} />
          {idx > 0 ? (
            <Field validationMessage={`Cosine similarity with input 1: ${data.similarities[idx]}`} validationState="none" className={styles.similarityRow}>
              <ProgressBar as="div" value={Math.max(0, data.similarities[idx])} max={1} shape="rounded" thickness="large" />
            </Field>
          ) : null}
        </div>
      ))}
    </div>
  );
}

interface EmbeddingsBarProps {
  embeddings: number[]
}

class EmbeddingsBar extends PureComponent<EmbeddingsBarProps> {
  canvasRef: RefObject<HTMLCanvasElement>;

  constructor(props: EmbeddingsBarProps) {
    super(props);
    this.canvasRef = createRef();
    this.redraw = this.redraw.bind(this);
  }

  componentDidMount() {
    this.redraw();
    window.addEventListener("resize", this.redraw);
  }

  componentWillUnmount() {
    window.removeEventListener("resize", this.redraw);
  }

  componentDidUpdate(prevProps: Readonly<EmbeddingsBarProps>, prevState: any): void {
    if (prevProps.embeddings !== this.props.embeddings) {
      this.redraw();
    }
  }

  render() {
    return (<canvas ref={this.canvasRef} className={styles.embeddingsBar} />);
  }

  redraw() {
    if (!this.canvasRef.current) {
      return;
    }

    const { embeddings } = this.props;
    const canvas = this.canvasRef.current as HTMLCanvasElement;
    const dpr = window.devicePixelRatio;

    let blockCssSize = 6;
    if (embeddings.length >= 4000) {
      blockCssSize = 2;
    }
    const blockPixelSize = Math.round(blockCssSize * dpr);
    const nbBlocks = this.props.embeddings.length;
    const blocksPerRow = Math.floor(Math.sqrt(nbBlocks));
    canvas.width = blocksPerRow * blockPixelSize;
    canvas.style.width = `${blocksPerRow * blockCssSize}px`;
    const nbRows = Math.ceil(nbBlocks / blocksPerRow);
    canvas.height = nbRows * blockPixelSize;
    canvas.style.height = `${nbRows * blockCssSize}px`;

    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < embeddings.length; i += 1) {
      const row = Math.floor(i / blocksPerRow);
      const col = i % blocksPerRow;
      let p = embeddings[i];
      const POW_FACTOR = 0.3;
      p = Math.sign(p) * Math.pow(Math.abs(p), POW_FACTOR);
      let color;
      if (p < 0) {
        p = -p;
        color = `rgb(255, ${(1 - p) * 255}, ${(1 - p) * 255})`;
      } else {
        color = `rgb(${(1 - p) * 255}, 255, ${(1 - p) * 255})`;
      }
      ctx.fillStyle = color;
      ctx.strokeStyle = 'none';
      ctx.fillRect(col * blockPixelSize, row * blockPixelSize, blockPixelSize, blockPixelSize);
    }
  }
}
