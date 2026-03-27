package com.accessai.accessai_backend.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.accessai.accessai_backend.model.AnalyzeRequest;
import com.accessai.accessai_backend.model.AnalyzeResponse;
import com.accessai.accessai_backend.service.ClaudeService;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class AccessAIController {

    private final ClaudeService claudeService;

    @PostMapping("/analyze")
    public ResponseEntity<AnalyzeResponse> analyze(@Valid @RequestBody AnalyzeRequest request) {
        log.info("Received analyze request for mode: {}", request.getMode());
        try {
            String result = claudeService.analyzeImage(request);
            return ResponseEntity.ok(new AnalyzeResponse(result, request.getMode(), true, null));
        } catch (Exception e) {
            log.error("Analysis failed", e);
            return ResponseEntity.internalServerError()
                    .body(new AnalyzeResponse(null, request.getMode(), false, e.getMessage()));
        }
    }

    @GetMapping("/health")
    public ResponseEntity<String> health() {
        return ResponseEntity.ok("AccessAI backend is running!");
    }
}