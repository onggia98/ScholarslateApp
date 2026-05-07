package com.nmcnpm.scholarslate.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.SchedulingConfigurer;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;
import org.springframework.scheduling.config.ScheduledTaskRegistrar;

/**
 * Thread pool riêng cho Scheduler — tránh block main thread.
 * Pool size 3: Main Pipeline + Retry Scheduler + buffer.
 */
@Configuration
public class SchedulerConfig implements SchedulingConfigurer {

    @Override
    public void configureTasks(ScheduledTaskRegistrar taskRegistrar) {
        ThreadPoolTaskScheduler scheduler = new ThreadPoolTaskScheduler();
        scheduler.setPoolSize(3);
        scheduler.setThreadNamePrefix("paper-scheduler-");
        scheduler.initialize();
        taskRegistrar.setTaskScheduler(scheduler);
    }
}
