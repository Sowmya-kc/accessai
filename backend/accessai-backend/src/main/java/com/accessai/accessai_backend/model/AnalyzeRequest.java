package com.accessai.accessai_backend.model;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class AnalyzeRequest {
    @NotBlank(message = "Image data is required")
    private String imageBase64;

    @NotBlank(message = "MIME type is required")
    private String mimeType;

    @NotBlank(message = "Mode is required")
    private String mode;
}