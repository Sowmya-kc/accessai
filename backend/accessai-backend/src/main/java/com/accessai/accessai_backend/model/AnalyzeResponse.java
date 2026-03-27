package com.accessai.accessai_backend.model;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@AllArgsConstructor
@NoArgsConstructor
public class AnalyzeResponse {
    private String result;
    private String mode;
    private boolean success;
    private String error;
}