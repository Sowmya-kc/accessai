package com.accessai.accessai_backend.service;

import com.accessai.accessai_backend.model.AnalyzeRequest;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class ClaudeService {

    private final WebClient claudeWebClient;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private static final String MODEL = "claude-sonnet-4-20250514";

    private static final String SYSTEM_PROMPT = """
            You are AccessAI, a compassionate voice-first visual assistant for visually impaired users.
            When analyzing images:
            1. Call out safety hazards immediately — start with Warning: if any exist
            2. Describe the scene clearly — what is ahead, left, right
            3. Read ALL visible text verbatim
            4. Describe people positions and mood
            5. End with Suggested action: for next step
            Plain spoken language only. Under 100 words unless reading long text.
            """;

    private static final Map<String, String> MODE_PROMPTS = Map.of(
        "scene",    "Describe everything you see for a visually impaired person.",
        "text",     "Read ALL visible text word for word.",
        "hazard",   "Safety check: identify every obstacle, step, or danger.",
        "navigate", "Help me navigate. Describe path ahead, doors, exits.",
        "social",   "Describe people present: how many, where, body language."
    );

    public String analyzeImage(AnalyzeRequest request) {
        String prompt = MODE_PROMPTS.getOrDefault(request.getMode(), MODE_PROMPTS.get("scene"));

        ObjectNode body = objectMapper.createObjectNode();
        body.put("model", MODEL);
        body.put("max_tokens", 1000);
        body.put("system", SYSTEM_PROMPT);

        ArrayNode messages = body.putArray("messages");
        ObjectNode userMessage = messages.addObject();
        userMessage.put("role", "user");
        ArrayNode content = userMessage.putArray("content");

        ObjectNode imageBlock = content.addObject();
        imageBlock.put("type", "image");
        ObjectNode source = imageBlock.putObject("source");
        source.put("type", "base64");
        source.put("media_type", request.getMimeType());
        source.put("data", request.getImageBase64());

        ObjectNode textBlock = content.addObject();
        textBlock.put("type", "text");
        textBlock.put("text", prompt);

        log.info("Calling Claude API for mode: {}", request.getMode());

        String responseBody = claudeWebClient
                .post()
                .uri("/v1/messages")
                .bodyValue(body)
                .retrieve()
                .bodyToMono(String.class)
                .block();

        try {
            JsonNode responseJson = objectMapper.readTree(responseBody);
            JsonNode contentArray = responseJson.get("content");
            if (contentArray != null && contentArray.isArray()) {
                StringBuilder result = new StringBuilder();
                for (JsonNode item : contentArray) {
                    if ("text".equals(item.path("type").asText())) {
                        result.append(item.path("text").asText());
                    }
                }
                return result.toString();
            }
        } catch (Exception e) {
            log.error("Failed to parse Claude API response", e);
        }
        return "Could not analyze the image. Please try again.";
    }
}