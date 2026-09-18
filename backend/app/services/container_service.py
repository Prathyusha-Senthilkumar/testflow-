import asyncio
import shutil
from typing import Any, Dict, List, Optional


def _docker_bin() -> Optional[str]:
    return shutil.which("docker")


async def list_execution_containers(execution_id: Optional[str] = None) -> List[Dict[str, Any]]:
    docker = _docker_bin()
    if not docker:
        return []

    name_filter = f"testflow-exec-{execution_id}" if execution_id else "testflow-exec-"
    proc = await asyncio.create_subprocess_exec(
        docker, "ps", "-a",
        "--filter", f"name={name_filter}",
        "--format", "{{.ID}}\t{{.Names}}\t{{.Status}}\t{{.Image}}\t{{.CreatedAt}}",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, _stderr = await proc.communicate()
    if proc.returncode != 0:
        return []

    containers: List[Dict[str, Any]] = []
    for line in stdout.decode("utf-8", errors="replace").splitlines():
        parts = line.split("\t")
        if len(parts) < 4:
            continue
        container_id, name, status, image = parts[0], parts[1], parts[2], parts[3]
        created = parts[4] if len(parts) > 4 else None
        derived_exec_id = name
        prefix = "testflow-exec-"
        if name.startswith(prefix):
            derived_exec_id = name[len(prefix):]
        if execution_id and derived_exec_id != execution_id and name != f"{prefix}{execution_id}":
            continue
        containers.append({
            "id": container_id,
            "name": name,
            "status": status,
            "image": image,
            "created_at": created,
            "execution_id": derived_exec_id,
        })
    return containers
