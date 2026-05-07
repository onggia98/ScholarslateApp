package com.nmcnpm.scholarslate.util;

/**
 * Utility cho pgvector — chuyển đổi giữa float[] và chuỗi vector PostgreSQL.
 * Dùng chung cho PaperService (recommendation) và PaperPipelineService (duplicate detection).
 */
public final class VectorUtils {

    private VectorUtils() { /* utility class */ }

    /**
     * Chuyển float[] → "[0.1,0.2,...,0.384]" — định dạng pgvector cho native query.
     */
    public static String toVectorString(float[] embedding) {
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < embedding.length; i++) {
            if (i > 0) sb.append(",");
            sb.append(embedding[i]);
        }
        sb.append("]");
        return sb.toString();
    }
}
