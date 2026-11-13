# Рендер діаграм

Із кореня репозиторію (PowerShell або bash):

```shell
docker run --rm -v "${PWD}/docs/diagrams:/data" plantuml/plantuml:1.2026.9 -tsvg -o svg "/data/**.puml"
docker run --rm -e _JAVA_OPTIONS=-DPLANTUML_LIMIT_SIZE=16384 -v "${PWD}/docs/diagrams:/data" plantuml/plantuml:1.2026.9 -tpng -Sdpi=200 -o png "/data/**.puml"
```
