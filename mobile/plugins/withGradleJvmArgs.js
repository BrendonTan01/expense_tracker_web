const { withGradleProperties } = require("expo/config-plugins");

/**
 * Config plugin to increase Gradle JVM memory (heap + metaspace).
 * Fixes "lintVitalAnalyzeRelease FAILED" and "Metaspace" errors during EAS Android builds.
 */
module.exports = function withGradleJvmArgs(config) {
  return withGradleProperties(config, (config) => {
    const properties = config.modResults;
    const jvmArgs = "-Xmx4096m -XX:MaxMetaspaceSize=512m";

    const existingIndex = properties.findIndex(
      (item) => item.type === "property" && item.key === "org.gradle.jvmargs"
    );

    if (existingIndex >= 0) {
      properties[existingIndex].value = jvmArgs;
    } else {
      properties.push({
        type: "property",
        key: "org.gradle.jvmargs",
        value: jvmArgs,
      });
    }

    config.modResults = properties;
    return config;
  });
};
