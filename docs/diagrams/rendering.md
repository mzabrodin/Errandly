# Рендер діаграм

```bash
cd docs/diagrams
docker run --rm -v "$PWD:/data" plantuml/plantuml:1.2026.9 -tsvg -o /data/svg /data/puml/*.puml
docker run --rm -e _JAVA_OPTIONS=-DPLANTUML_LIMIT_SIZE=16384 -v "$PWD:/data" plantuml/plantuml:1.2026.9 -tpng -Sdpi=200 -o /data/png /data/puml/*.puml
```
