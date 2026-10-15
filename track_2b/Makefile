
.PHONY: run stop logs build clean

run:
	docker compose up --build

stop:
	docker compose down

logs:
	docker compose logs -f

build:
	docker compose build

clean:
	docker compose down --volumes --remove-orphans
