package com.accessai.accessai_backend.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.reactive.function.client.WebClient;

@Configuration
public class ClaudeApiConfig {

    @Value("${claude.api.key}")
    private String apiKey;

    @Value("${claude.api.base-url:https://api.anthropic.com}")
    private String baseUrl;

    @Bean
    public WebClient claudeWebClient() {
        return WebClient.builder()
                .baseUrl(baseUrl)
                .defaultHeader("Content-Type", "application/json")
                .defaultHeader("x-api-key", apiKey)
                .defaultHeader("anthropic-version", "2023-06-01")
                .build();
    }
}