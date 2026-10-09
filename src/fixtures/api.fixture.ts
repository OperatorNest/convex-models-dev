// Real slice of https://models.dev/api.json (MIT), used only by tests.
import type { Catalog } from "./index.js";

export const fixtureCatalog: Catalog = {
  openai: {
    id: "openai",
    env: ["OPENAI_API_KEY"],
    npm: "@ai-sdk/openai",
    name: "OpenAI",
    doc: "https://platform.openai.com/docs/models",
    models: {
      "gpt-5.4": {
        id: "gpt-5.4",
        name: "GPT-5.4",
        description: "Agent-ready GPT for coding and computer-use workflows at a lower cost",
        family: "gpt",
        attachment: true,
        reasoning: true,
        reasoning_options: [
          {
            type: "effort",
            values: ["none", "low", "medium", "high", "xhigh"],
          },
        ],
        tool_call: true,
        structured_output: true,
        temperature: true,
        knowledge: "2025-08-31",
        release_date: "2026-03-05",
        last_updated: "2026-03-05",
        modalities: {
          input: ["text", "image", "pdf"],
          output: ["text"],
        },
        open_weights: false,
        limit: {
          context: 1050000,
          input: 922000,
          output: 128000,
        },
        experimental: {
          modes: {
            fast: {
              cost: {
                input: 5,
                output: 30,
                cache_read: 0.5,
              },
              provider: {
                body: {
                  service_tier: "priority",
                },
              },
            },
          },
        },
        cost: {
          input: 2.5,
          output: 15,
          cache_read: 0.25,
          tiers: [
            {
              input: 5,
              output: 22.5,
              cache_read: 0.5,
              tier: {
                type: "context",
                size: 272000,
              },
            },
          ],
          context_over_200k: {
            input: 5,
            output: 22.5,
            cache_read: 0.5,
          },
        },
      },
      "gpt-5.6": {
        id: "gpt-5.6",
        name: "GPT-5.6",
        description:
          "Frontier GPT-5.6 model for complex professional work, coding, and agentic workflows",
        family: "gpt-sol",
        attachment: true,
        reasoning: true,
        reasoning_options: [
          {
            type: "effort",
            values: ["none", "low", "medium", "high", "xhigh", "max"],
          },
        ],
        tool_call: true,
        structured_output: true,
        temperature: false,
        knowledge: "2026-02-16",
        release_date: "2026-07-09",
        last_updated: "2026-07-09",
        modalities: {
          input: ["text", "image", "pdf"],
          output: ["text"],
        },
        open_weights: false,
        limit: {
          context: 1050000,
          input: 922000,
          output: 128000,
        },
        experimental: {
          modes: {
            fast: {
              cost: {
                input: 8,
                output: 40,
                cache_read: 0.8,
                cache_write: 10,
              },
              provider: {
                body: {
                  service_tier: "priority",
                },
              },
            },
            pro: {
              provider: {
                body: {
                  reasoning: {
                    mode: "pro",
                  },
                },
              },
            },
          },
        },
        cost: {
          input: 4,
          output: 20,
          cache_read: 0.4,
          cache_write: 5,
          tiers: [
            {
              input: 8,
              output: 30,
              cache_read: 0.8,
              cache_write: 10,
              tier: {
                type: "context",
                size: 272000,
              },
            },
          ],
          context_over_200k: {
            input: 8,
            output: 30,
            cache_read: 0.8,
            cache_write: 10,
          },
        },
        canonical_model_id: "openai/gpt-5.6-sol",
      },
      "gpt-5-mini": {
        id: "gpt-5-mini",
        name: "GPT-5 Mini",
        description: "Small GPT-5 for responsive agents, coding help, and everyday automation",
        family: "gpt-mini",
        attachment: true,
        reasoning: true,
        reasoning_options: [
          {
            type: "effort",
            values: ["minimal", "low", "medium", "high"],
          },
        ],
        tool_call: true,
        structured_output: true,
        temperature: false,
        knowledge: "2024-05-30",
        release_date: "2025-08-07",
        last_updated: "2025-08-07",
        modalities: {
          input: ["text", "image"],
          output: ["text"],
        },
        open_weights: false,
        limit: {
          context: 400000,
          input: 272000,
          output: 128000,
        },
        experimental: {
          modes: {
            fast: {
              cost: {
                input: 0.45,
                output: 3.6,
                cache_read: 0.045,
              },
              provider: {
                body: {
                  service_tier: "priority",
                },
              },
            },
            flex: {
              cost: {
                input: 0.125,
                output: 1,
                cache_read: 0.0125,
              },
              provider: {
                body: {
                  service_tier: "flex",
                },
              },
            },
          },
        },
        cost: {
          input: 0.25,
          output: 2,
          cache_read: 0.025,
        },
      },
      "gpt-3.5-turbo": {
        id: "gpt-3.5-turbo",
        name: "GPT-3.5-turbo",
        description: "Compact GPT model for low-latency assistance and high-volume workloads",
        family: "gpt",
        attachment: false,
        reasoning: false,
        tool_call: false,
        structured_output: false,
        temperature: true,
        knowledge: "2021-09-01",
        release_date: "2023-03-01",
        last_updated: "2023-11-06",
        modalities: {
          input: ["text"],
          output: ["text"],
        },
        open_weights: false,
        limit: {
          context: 16385,
          output: 4096,
        },
        status: "deprecated",
        cost: {
          input: 0.5,
          output: 1.5,
          cache_read: 0,
        },
      },
      "gpt-image-1-mini": {
        id: "gpt-image-1-mini",
        name: "gpt-image-1-mini",
        description:
          "Image model for prompt-driven generation, editing, and visual design workflows",
        family: "gpt-image",
        attachment: true,
        reasoning: false,
        tool_call: false,
        temperature: false,
        release_date: "2025-09-26",
        last_updated: "2025-09-26",
        modalities: {
          input: ["text", "image"],
          output: ["text", "image"],
        },
        open_weights: false,
        limit: {
          context: 0,
          input: 0,
          output: 0,
        },
      },
      "gpt-4o": {
        id: "gpt-4o",
        name: "GPT-4o",
        description: "Omni-era GPT for multimodal chat, practical coding, and general assistants",
        family: "gpt",
        attachment: true,
        reasoning: false,
        tool_call: true,
        structured_output: true,
        temperature: true,
        knowledge: "2023-09",
        release_date: "2024-05-13",
        last_updated: "2024-08-06",
        modalities: {
          input: ["text", "image", "pdf"],
          output: ["text"],
        },
        open_weights: false,
        limit: {
          context: 128000,
          output: 16384,
        },
        experimental: {
          modes: {
            fast: {
              cost: {
                input: 4.25,
                output: 17,
                cache_read: 2.125,
              },
              provider: {
                body: {
                  service_tier: "priority",
                },
              },
            },
          },
        },
        cost: {
          input: 2.5,
          output: 10,
          cache_read: 1.25,
        },
      },
    },
  },
  google: {
    id: "google",
    env: ["GOOGLE_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY", "GEMINI_API_KEY"],
    npm: "@ai-sdk/google",
    name: "Google",
    doc: "https://ai.google.dev/gemini-api/docs/models",
    models: {
      "gemini-2.5-pro": {
        id: "gemini-2.5-pro",
        name: "Gemini 2.5 Pro",
        description: "Google's proven reasoning model for coding, math, and multimodal analysis",
        family: "gemini-pro",
        attachment: true,
        reasoning: true,
        reasoning_options: [
          {
            type: "budget_tokens",
            min: 128,
            max: 32768,
          },
        ],
        tool_call: true,
        structured_output: true,
        temperature: true,
        knowledge: "2025-01",
        release_date: "2025-06-17",
        last_updated: "2025-06-17",
        modalities: {
          input: ["text", "image", "audio", "video", "pdf"],
          output: ["text"],
        },
        open_weights: false,
        limit: {
          context: 1048576,
          output: 65536,
        },
        cost: {
          input: 1.25,
          output: 10,
          cache_read: 0.125,
          tiers: [
            {
              input: 2.5,
              output: 15,
              cache_read: 0.25,
              tier: {
                type: "context",
                size: 200000,
              },
            },
          ],
          context_over_200k: {
            input: 2.5,
            output: 15,
            cache_read: 0.25,
          },
        },
        canonical_model_id: "google/gemini-2.5-pro",
      },
      "gemini-3.5-flash": {
        id: "gemini-3.5-flash",
        name: "Gemini 3.5 Flash",
        description: "Fast Gemini model balancing multimodal reasoning, tool use, and cost",
        family: "gemini-flash",
        attachment: true,
        reasoning: true,
        reasoning_options: [
          {
            type: "effort",
            values: ["minimal", "low", "medium", "high"],
          },
        ],
        tool_call: true,
        structured_output: true,
        temperature: true,
        knowledge: "2025-01",
        release_date: "2026-05-19",
        last_updated: "2026-05-19",
        modalities: {
          input: ["text", "image", "video", "audio", "pdf"],
          output: ["text"],
        },
        open_weights: false,
        limit: {
          context: 1048576,
          output: 65536,
        },
        cost: {
          input: 1.5,
          output: 9,
          cache_read: 0.15,
          input_audio: 1.5,
        },
      },
      "lyria-3-pro-preview": {
        id: "lyria-3-pro-preview",
        name: "Lyria 3 Pro Preview",
        description:
          "Music generation model for full-length songs from text or images with vocals and structure",
        family: "lyria",
        attachment: true,
        reasoning: false,
        tool_call: false,
        structured_output: false,
        temperature: true,
        release_date: "2026-03-25",
        last_updated: "2026-03-25",
        modalities: {
          input: ["text", "image"],
          output: ["text", "audio"],
        },
        open_weights: false,
        limit: {
          context: 1048576,
          output: 65536,
        },
        cost: {
          input: 0,
          output: 0,
        },
        canonical_model_id: "google/lyria-3-pro-preview",
      },
      "gemma-4-31b-it": {
        id: "gemma-4-31b-it",
        name: "Gemma 4 31B IT",
        description: "Largest Gemma 4 instruction model for open, self-hosted chat and reasoning",
        family: "gemma",
        attachment: true,
        reasoning: true,
        reasoning_options: [
          {
            type: "toggle",
          },
        ],
        tool_call: true,
        structured_output: true,
        temperature: true,
        release_date: "2026-04-02",
        last_updated: "2026-04-02",
        modalities: {
          input: ["text", "image"],
          output: ["text"],
        },
        open_weights: true,
        limit: {
          context: 262144,
          output: 32768,
        },
      },
      "gemini-2.5-flash": {
        id: "gemini-2.5-flash",
        name: "Gemini 2.5 Flash",
        description: "Fast Gemini workhorse for multimodal apps where latency and price matter",
        family: "gemini-flash",
        attachment: true,
        reasoning: true,
        reasoning_options: [
          {
            type: "toggle",
          },
          {
            type: "budget_tokens",
            min: 0,
            max: 24576,
          },
        ],
        tool_call: true,
        structured_output: true,
        temperature: true,
        knowledge: "2025-01",
        release_date: "2025-06-17",
        last_updated: "2025-06-17",
        modalities: {
          input: ["text", "image", "audio", "video", "pdf"],
          output: ["text"],
        },
        open_weights: false,
        limit: {
          context: 1048576,
          output: 65536,
        },
        cost: {
          input: 0.3,
          output: 2.5,
          cache_read: 0.03,
          input_audio: 1,
        },
        canonical_model_id: "google/gemini-2.5-flash",
      },
    },
  },
  anthropic: {
    id: "anthropic",
    env: ["ANTHROPIC_API_KEY"],
    npm: "@ai-sdk/anthropic",
    name: "Anthropic",
    doc: "https://docs.anthropic.com/en/docs/about-claude/models",
    models: {
      "claude-sonnet-4-5": {
        id: "claude-sonnet-4-5",
        name: "Claude Sonnet 4.5 (latest)",
        description:
          "Balanced Claude model for coding, analysis, agent workflows, and cost control",
        family: "claude-sonnet",
        attachment: true,
        reasoning: true,
        reasoning_options: [
          {
            type: "budget_tokens",
            min: 1024,
          },
        ],
        tool_call: true,
        structured_output: true,
        temperature: true,
        knowledge: "2025-07-31",
        release_date: "2025-09-29",
        last_updated: "2025-09-29",
        modalities: {
          input: ["text", "image", "pdf"],
          output: ["text"],
        },
        open_weights: false,
        limit: {
          context: 1000000,
          output: 64000,
        },
        cost: {
          input: 3,
          output: 15,
          cache_read: 0.3,
          cache_write: 3.75,
        },
        canonical_model_id: "anthropic/claude-sonnet-4-5",
      },
      "claude-opus-4-5": {
        id: "claude-opus-4-5",
        name: "Claude Opus 4.5 (latest)",
        description: "Flagship Claude model for deep reasoning, coding, and long-horizon agents",
        family: "claude-opus",
        attachment: true,
        reasoning: true,
        reasoning_options: [
          {
            type: "effort",
            values: ["low", "medium", "high"],
          },
          {
            type: "budget_tokens",
            min: 1024,
          },
        ],
        tool_call: true,
        structured_output: true,
        temperature: true,
        knowledge: "2025-05",
        release_date: "2025-11-24",
        last_updated: "2025-11-24",
        modalities: {
          input: ["text", "image", "pdf"],
          output: ["text"],
        },
        open_weights: false,
        limit: {
          context: 200000,
          output: 64000,
        },
        cost: {
          input: 5,
          output: 25,
          cache_read: 0.5,
          cache_write: 6.25,
        },
        canonical_model_id: "anthropic/claude-opus-4-5",
      },
      "claude-haiku-4-5": {
        id: "claude-haiku-4-5",
        name: "Claude Haiku 4.5 (latest)",
        description: "Fast Claude lane for lightweight agents, office tasks, and responsive chat",
        family: "claude-haiku",
        attachment: true,
        reasoning: true,
        reasoning_options: [
          {
            type: "budget_tokens",
            min: 1024,
          },
        ],
        tool_call: true,
        structured_output: true,
        temperature: true,
        knowledge: "2025-02-28",
        release_date: "2025-10-15",
        last_updated: "2025-10-15",
        modalities: {
          input: ["text", "image", "pdf"],
          output: ["text"],
        },
        open_weights: false,
        limit: {
          context: 200000,
          output: 64000,
        },
        cost: {
          input: 1,
          output: 5,
          cache_read: 0.1,
          cache_write: 1.25,
        },
        canonical_model_id: "anthropic/claude-haiku-4-5",
      },
      "claude-opus-4-8": {
        id: "claude-opus-4-8",
        name: "Claude Opus 4.8",
        description:
          "Top Claude Opus tier for the hardest reasoning, coding, and long-horizon agents",
        family: "claude-opus",
        attachment: true,
        reasoning: true,
        reasoning_options: [
          {
            type: "effort",
            values: ["low", "medium", "high", "xhigh", "max"],
          },
        ],
        tool_call: true,
        structured_output: true,
        temperature: false,
        knowledge: "2026-01",
        release_date: "2026-05-28",
        last_updated: "2026-05-28",
        modalities: {
          input: ["text", "image", "pdf"],
          output: ["text"],
        },
        open_weights: false,
        limit: {
          context: 1000000,
          output: 128000,
        },
        experimental: {
          modes: {
            fast: {
              cost: {
                input: 10,
                output: 50,
                cache_read: 1,
                cache_write: 12.5,
              },
              provider: {
                body: {
                  speed: "fast",
                },
                headers: {
                  "anthropic-beta": "fast-mode-2026-02-01",
                },
              },
            },
          },
        },
        cost: {
          input: 5,
          output: 25,
          cache_read: 0.5,
          cache_write: 6.25,
        },
      },
    },
  },
  azure: {
    id: "azure",
    env: ["AZURE_RESOURCE_NAME", "AZURE_API_KEY"],
    npm: "@ai-sdk/azure",
    name: "Azure",
    doc: "https://learn.microsoft.com/en-us/azure/ai-services/openai/concepts/models",
    models: {
      "gpt-5.4": {
        id: "gpt-5.4",
        name: "GPT-5.4",
        description: "Agent-ready GPT for coding and computer-use workflows at a lower cost",
        family: "gpt",
        attachment: true,
        reasoning: true,
        reasoning_options: [
          {
            type: "effort",
            values: ["none", "low", "medium", "high", "xhigh"],
          },
        ],
        tool_call: true,
        structured_output: true,
        temperature: true,
        knowledge: "2025-08-31",
        release_date: "2026-03-05",
        last_updated: "2026-03-05",
        modalities: {
          input: ["text", "image", "pdf"],
          output: ["text"],
        },
        open_weights: false,
        limit: {
          context: 1050000,
          input: 922000,
          output: 128000,
        },
        cost: {
          input: 2.5,
          output: 15,
          cache_read: 0.25,
          tiers: [
            {
              input: 5,
              output: 22.5,
              cache_read: 0.5,
              tier: {
                type: "context",
                size: 272000,
              },
            },
          ],
          context_over_200k: {
            input: 5,
            output: 22.5,
            cache_read: 0.5,
          },
        },
        canonical_model_id: "openai/gpt-5.4",
      },
      "claude-sonnet-4-5": {
        id: "claude-sonnet-4-5",
        name: "Claude Sonnet 4.5",
        description:
          "Balanced Claude model for coding, analysis, agent workflows, and cost control",
        family: "claude-sonnet",
        attachment: true,
        reasoning: true,
        reasoning_options: [
          {
            type: "budget_tokens",
            min: 1024,
          },
        ],
        tool_call: true,
        structured_output: true,
        temperature: true,
        knowledge: "2025-07-31",
        release_date: "2025-11-18",
        last_updated: "2025-11-18",
        modalities: {
          input: ["text", "image", "pdf"],
          output: ["text"],
        },
        open_weights: false,
        limit: {
          context: 200000,
          output: 64000,
        },
        provider: {
          npm: "@ai-sdk/anthropic",
          api: "https://${AZURE_RESOURCE_NAME}.services.ai.azure.com/anthropic/v1",
        },
        cost: {
          input: 3,
          output: 15,
          cache_read: 0.3,
          cache_write: 3.75,
        },
      },
      "gpt-4o": {
        id: "gpt-4o",
        name: "GPT-4o",
        description: "Omni-era GPT for multimodal chat, practical coding, and general assistants",
        family: "gpt",
        attachment: true,
        reasoning: false,
        tool_call: true,
        temperature: true,
        knowledge: "2023-09",
        release_date: "2024-05-13",
        last_updated: "2024-08-06",
        modalities: {
          input: ["text", "image"],
          output: ["text"],
        },
        open_weights: false,
        limit: {
          context: 128000,
          output: 16384,
        },
        status: "deprecated",
        cost: {
          input: 2.5,
          output: 10,
          cache_read: 1.25,
        },
        canonical_model_id: "openai/gpt-4o",
      },
      "claude-opus-4-8": {
        id: "claude-opus-4-8",
        name: "Claude Opus 4.8",
        description:
          "Top Claude Opus tier for the hardest reasoning, coding, and long-horizon agents",
        family: "claude-opus",
        attachment: true,
        reasoning: true,
        reasoning_options: [
          {
            type: "effort",
            values: ["low", "medium", "high", "xhigh", "max"],
          },
        ],
        tool_call: true,
        temperature: false,
        knowledge: "2025-12-31",
        release_date: "2026-05-28",
        last_updated: "2026-05-28",
        modalities: {
          input: ["text", "image", "pdf"],
          output: ["text"],
        },
        open_weights: false,
        limit: {
          context: 1000000,
          output: 128000,
        },
        provider: {
          npm: "@ai-sdk/anthropic",
          api: "https://${AZURE_RESOURCE_NAME}.services.ai.azure.com/anthropic/v1",
        },
        cost: {
          input: 5,
          output: 25,
          cache_read: 0.5,
          cache_write: 6.25,
          tiers: [
            {
              input: 10,
              output: 37.5,
              cache_read: 1,
              cache_write: 12.5,
              tier: {
                type: "context",
                size: 200000,
              },
            },
          ],
          context_over_200k: {
            input: 10,
            output: 37.5,
            cache_read: 1,
            cache_write: 12.5,
          },
        },
        canonical_model_id: "anthropic/claude-opus-4-8",
      },
    },
  },
  deepseek: {
    id: "deepseek",
    env: ["DEEPSEEK_API_KEY"],
    npm: "@ai-sdk/openai-compatible",
    api: "https://api.deepseek.com",
    name: "DeepSeek",
    doc: "https://api-docs.deepseek.com/quick_start/pricing",
    models: {
      "deepseek-v4-pro": {
        id: "deepseek-v4-pro",
        name: "DeepSeek V4 Pro",
        description:
          "DeepSeek V4 Pro snapshot with million-token context and support for thinking and non-thinking modes",
        family: "deepseek-thinking",
        attachment: false,
        reasoning: true,
        reasoning_options: [
          {
            type: "toggle",
          },
          {
            type: "effort",
            values: ["low", "high", "max"],
          },
        ],
        tool_call: true,
        interleaved: {
          field: "reasoning_content",
        },
        structured_output: true,
        temperature: true,
        release_date: "2026-08-12",
        last_updated: "2026-08-22",
        modalities: {
          input: ["text"],
          output: ["text"],
        },
        open_weights: true,
        limit: {
          context: 1000000,
          output: 393216,
        },
        cost: {
          input: 0.66,
          output: 1.98,
          reasoning: 1.98,
          cache_read: 0.022,
        },
        canonical_model_id: "deepseek/deepseek-v4-pro-0813",
      },
      "deepseek-v4-flash-vision-exp": {
        id: "deepseek-v4-flash-vision-exp",
        name: "DeepSeek V4 Flash Vision Exp",
        description: "DeepSeek V4.1 Flash model for reasoning and agentic coding",
        family: "deepseek-flash",
        attachment: true,
        reasoning: true,
        reasoning_options: [
          {
            type: "toggle",
          },
          {
            type: "effort",
            values: ["low", "high", "max"],
          },
        ],
        tool_call: true,
        interleaved: {
          field: "reasoning_content",
        },
        structured_output: true,
        temperature: true,
        knowledge: "2025-05",
        release_date: "2026-09-10",
        last_updated: "2026-09-10",
        modalities: {
          input: ["text", "image"],
          output: ["text"],
        },
        open_weights: true,
        limit: {
          context: 1000000,
          output: 393216,
        },
        status: "deprecated",
        cost: {
          input: 0.15,
          output: 0.6,
          reasoning: 0.6,
          cache_read: 0.003,
        },
        canonical_model_id: "deepseek/deepseek-v4.1-flash",
      },
    },
  },
};
