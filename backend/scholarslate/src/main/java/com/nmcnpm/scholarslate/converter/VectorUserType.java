package com.nmcnpm.scholarslate.converter;

import org.hibernate.engine.spi.SharedSessionContractImplementor;
import org.hibernate.usertype.UserType;
import org.postgresql.util.PGobject;

import java.io.Serializable;
import java.sql.*;
import java.util.Arrays;

/**
 * Hibernate UserType cho pgvector — map float[] ↔ PostgreSQL vector(384).
 *
 * Vì sao không dùng AttributeConverter:
 *   AttributeConverter<float[], String> bind qua JDBC setString() → PostgreSQL
 *   báo lỗi "column is of type vector but expression is of type character varying".
 *
 * Fix: dùng PGobject với type="vector" → JDBC driver gửi đúng OID cho PostgreSQL,
 * cho phép implicit cast từ text → vector trong pgvector extension.
 */
public class VectorUserType implements UserType<float[]> {

    @Override
    public int getSqlType() {
        return Types.OTHER;   // pgvector là custom type → dùng OTHER
    }

    @Override
    public Class<float[]> returnedClass() {
        return float[].class;
    }

    @Override
    public boolean equals(float[] x, float[] y) {
        return Arrays.equals(x, y);
    }

    @Override
    public int hashCode(float[] x) {
        return Arrays.hashCode(x);
    }

    @Override
    public float[] nullSafeGet(ResultSet rs, int position,
                               SharedSessionContractImplementor session,
                               Object owner) throws SQLException {
        String value = rs.getString(position);
        return value == null ? null : parseVector(value);
    }

    @Override
    public void nullSafeSet(PreparedStatement st, float[] value, int index,
                            SharedSessionContractImplementor session) throws SQLException {
        if (value == null) {
            st.setNull(index, Types.OTHER);
        } else {
            // PGobject với type="vector" → PostgreSQL nhận đúng type, không cần CAST
            PGobject pgObj = new PGobject();
            pgObj.setType("vector");
            pgObj.setValue(toVectorString(value));
            st.setObject(index, pgObj);
        }
    }

    @Override
    public float[] deepCopy(float[] value) {
        return value == null ? null : Arrays.copyOf(value, value.length);
    }

    @Override
    public boolean isMutable() {
        return true;
    }

    @Override
    public Serializable disassemble(float[] value) {
        return deepCopy(value);
    }

    @Override
    public float[] assemble(Serializable cached, Object owner) {
        return deepCopy((float[]) cached);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /** float[] → "[0.1,0.2,...,0.384]" — định dạng pgvector */
    private String toVectorString(float[] arr) {
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < arr.length; i++) {
            if (i > 0) sb.append(",");
            sb.append(arr[i]);
        }
        sb.append("]");
        return sb.toString();
    }

    /** "[0.1,0.2,...,0.384]" → float[] */
    private float[] parseVector(String s) {
        String trimmed = s.trim();
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
