package vn.goplant.backend.catalog;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.UUID;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

class PopularPlantCatalogSeederTest {

    @SuppressWarnings("unchecked")
    @Test
    void insertsAll91PlantsAndSourcesWhenCatalogIsEmpty() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        UUID adminId = UUID.randomUUID();
        when(jdbc.query(contains("FROM users u"), any(RowMapper.class)))
                .thenReturn(List.of(adminId));
        when(jdbc.query(contains("SELECT id FROM plant_catalog WHERE lower(scientific_name)=lower(?)"),
                any(RowMapper.class), anyString()))
                .thenReturn(List.of());

        PopularPlantCatalogSeeder seeder = new PopularPlantCatalogSeeder(jdbc, new ObjectMapper());
        seeder.run(null);

        verify(jdbc, times(91)).update(
                contains("INSERT INTO plant_catalog("),
                any(UUID.class), anyString(), anyString(), anyString(),
                anyString(), anyString(), any(Integer.class), anyString(),
                anyString(), anyString(), anyString(), anyString(),
                anyString(), anyString(), anyString(), anyString(), anyString(),
                anyString(), anyString(), anyString(), anyString(),
                eq(adminId));
        verify(jdbc, times(91)).update(
                contains("INSERT INTO plant_catalog_sources("),
                any(UUID.class), anyString(), anyString(), anyString(), eq(adminId));
        verify(jdbc, never()).update(contains("UPDATE plant_catalog SET"), any(Object[].class));
    }

    @SuppressWarnings("unchecked")
    @Test
    void backfillsExistingPlantsWithoutDuplicateInserts() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        UUID adminId = UUID.randomUUID();
        UUID existingId = UUID.randomUUID();
        when(jdbc.query(contains("FROM users u"), any(RowMapper.class)))
                .thenReturn(List.of(adminId));
        when(jdbc.query(contains("SELECT id FROM plant_catalog WHERE lower(scientific_name)=lower(?)"),
                any(RowMapper.class), anyString()))
                .thenReturn(List.of(existingId));

        PopularPlantCatalogSeeder seeder = new PopularPlantCatalogSeeder(jdbc, new ObjectMapper());
        seeder.run(null);

        verify(jdbc, times(91)).update(
                contains("UPDATE plant_catalog SET"),
                anyString(), anyString(), any(Integer.class), anyString(),
                anyString(), anyString(), anyString(), anyString(),
                anyString(), anyString(), anyString(), anyString(), anyString(),
                anyString(), anyString(), anyString(), anyString(),
                eq(existingId));
        verify(jdbc, never()).update(contains("INSERT INTO plant_catalog("), any(Object[].class));
        verify(jdbc, never()).update(contains("INSERT INTO plant_catalog_sources("), any(Object[].class));
    }
}
