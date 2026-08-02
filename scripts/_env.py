"""자격증명 환경변수 로더 (외부 의존성 없음).

repo가 public이라 API 키를 소스에 두지 않는다. 키는 .env 로만 관리하고
스크립트는 이 로더를 통해 읽는다.

우선순위: os.environ > 프로젝트 .env > ~/.env
  - 프로젝트 .env = /Users/woodelight/Projects/ami-work/.env (gitignore 대상)
  - ~/.env        = 머신 공용 보관처 (NAVER_GEOCODE_ID/SECRET 등 기존 저장 위치)

경로를 절대경로 상수로 두는 이유: 팀 데스크가 각자 브랜치 worktree에서 실행해도
.env 단일정본(main 트리)을 보게 하기 위함. (docs/data-contract.md 물리위치 규칙과 동일 취지)

사용:
    import sys, os
    sys.path.insert(0, os.path.join(BASE, 'scripts'))   # scripts 밖 스크립트만 필요
    from _env import require_env

    KAKAO_KEY = require_env('KAKAO_REST_API_KEY')
"""

import os
from pathlib import Path

PROJECT_ENV = Path('/Users/woodelight/Projects/ami-work/.env')
HOME_ENV = Path.home() / '.env'

_cache = None


def _parse(path):
    """단순 KEY=VALUE 파서. 주석/빈줄/export 접두/양끝 따옴표 처리."""
    out = {}
    try:
        text = path.read_text(encoding='utf-8')
    except (OSError, UnicodeDecodeError):
        return out
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        if line.startswith('export '):
            line = line[len('export '):].lstrip()
        key, _, val = line.partition('=')
        key = key.strip()
        val = val.strip()
        if len(val) >= 2 and val[0] == val[-1] and val[0] in ('"', "'"):
            val = val[1:-1]
        if key:
            out[key] = val
    return out


def _load():
    global _cache
    if _cache is None:
        merged = _parse(HOME_ENV)          # 낮은 우선순위
        merged.update(_parse(PROJECT_ENV))  # 프로젝트 값이 덮어씀
        _cache = merged
    return _cache


def get_env(name, default=None):
    """환경변수 조회. 없으면 default."""
    val = os.environ.get(name)
    if val:
        return val
    return _load().get(name) or default


def require_env(name):
    """필수 자격증명 조회. 없으면 어디에 무엇을 넣어야 하는지 알려주고 중단."""
    val = get_env(name)
    if not val:
        raise RuntimeError(
            "[자격증명 없음] 환경변수 %s 가 설정되지 않았습니다.\n"
            "  해결: 아래 중 한 곳에 추가하세요 (둘 다 git 추적 대상 아님)\n"
            "    - %s\n"
            "    - %s\n"
            "  형식: %s=발급받은_키값" % (name, PROJECT_ENV, HOME_ENV, name)
        )
    return val
