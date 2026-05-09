package com.nmcnpm.scholarslate.converter;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

/**
 * LEGACY — không được dùng trực tiếp nữa.
 * Codebase hiện dùng VectorUserType (@Type annotation) thay thế vì AttributeConverter<float[], String>
 * gửi setString() qua JDBC → PostgreSQL báo lỗi type mismatch với kiểu vector.
 * VectorUserType dùng PGobject.setType("vector") để bind đúng OID.
 *
 * Class này giữ lại để tham khảo nhưng KHÔNG được đặt @Converter(autoApply=true).
 */
@Converter
public class VectorConverter implements AttributeConverter<float[], String> {

    @Override
    public String convertToDatabaseColumn(float[] attribute) {
        if (attribute == null) return null;

        // Chuyển float[] → "[0.1,0.2,...,0.384]" — định dạng pgvector chấp nhận
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < attribute.length; i++) {
            if (i > 0) sb.append(",");
            sb.append(attribute[i]);
        }
        sb.append("]");
        return sb.toString();
    }

    @Override
    public float[] convertToEntityAttribute(String dbData) {
        if (dbData == null) return null;

        // Parse "[0.1,0.2,...,0.384]" → float[]
        // PostgreSQL trả về dạng "[x,y,z]" — bỏ dấu ngoặc trước khi split
        String trimmed = dbData.trim();
        if (trimmed.startsWith("[")) {
            trimmed = trimmed.substring(1, trimmed.length() - 1);
        }
        String[] parts = trimmed.split(",");
        float[] result = new float[parts.length];
        for (int i = 0; i < parts.length; i++) {
            result[i] = Float.parseFloat(parts[i].trim());
        }
        return result;
    }
}
