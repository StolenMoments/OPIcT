# OPIc 운영 배포

운영 앱은 OCI aarch64 인스턴스의 `/home/opc/opict`에 설치한다. Node.js 서버와
Vite 빌드 결과를 한 프로세스로 제공하며, 외부 요청은 Nginx가
`https://opict.mygreed.shop`에서 `127.0.0.1:3001`로 전달한다. Docker는 사용하지
않는다.

## 최초 서버 준비

`opc` 사용자로 로그인한 뒤, Node.js 24와 user systemd를 준비한다. 재부팅 후에도
user unit이 실행되어야 하므로 다음 명령은 한 번만 root 권한으로 실행한다.

```bash
sudo loginctl enable-linger opc
mkdir -p /home/opc/opict
```

`/home/opc/opict/.env`는 서버에서 직접 만들고 저장소에 커밋하지 않는다. 최소한
다음 운영 경로를 포함해야 한다. AI CLI 인증정보는 GitHub Secrets로 복사하지 않고
`opc` 사용자의 기존 `claude`, `codex`, `agy` 인증을 사용한다.

```dotenv
OPICT_WHISPER_BIN=/home/opc/tools/whisper.cpp/build/bin/whisper-cli
OPICT_WHISPER_MODEL=/home/opc/tools/whisper.cpp/models/ggml-base.en.bin
TZ=Asia/Seoul
```

초기 접속 비밀번호와 세션 비밀키는 저장소나 GitHub Secrets에 넣지 않는다. 소스가
전달된 뒤 다음 명령을 한 번만 실행하면 임의의 초기 비밀번호를 생성하고 해시·세션
비밀키만 `.env`에 저장한다. 명령 출력의 비밀번호를 안전한 곳에 보관한다.

```bash
cd /home/opc/opict
node scripts/init-opict-auth.mjs --env /home/opc/opict/.env
```

이미 인증 키가 있는 `.env`는 덮어쓰지 않으므로, 출력된 초기 비밀번호를 잊은
경우에는 별도 비밀번호 재설정 절차를 수행해야 한다.

소스가 서버에 전달된 뒤 Whisper와 오디오 의존성을 한 번 준비한다.

```bash
cd /home/opc/opict
bash scripts/bootstrap-opict.sh
```

부트스트랩은 aarch64가 아니면 중단하고, 이미 바이너리와 모델이 모두 있으면
기존 설치를 보존한다. 새 설치는 Whisper.cpp `v1.7.4`를 빌드하고
`models/ggml-base.en.bin`을 준비한다.

## 최초 소스·데이터 전송

GitHub Actions를 활성화하기 전에 현재 소스와 배포 파일을 한 번 전송한다. 운영
`.env`, `server/data`, 의존성 디렉터리와 `web/dist`는 전송하지 않는다.

```bash
rsync -avz --delete \
  --exclude='.git/' \
  --exclude='.env' \
  --exclude='server/data/' \
  --exclude='server/node_modules/' \
  --exclude='web/node_modules/' \
  --exclude='web/dist/' \
  ./ opc@146.56.170.98:/home/opc/opict/
```

로컬 DB를 옮길 때는 로컬 서버를 먼저 중지한다. 원격 DB가 이미 있으면 덮어쓰지
않는다. 원격에 데이터가 없는 최초 설치에서만 로컬 `server/data`를 별도 복사한다.

```bash
if ssh opc@146.56.170.98 'test -e /home/opc/opict/server/data/opict.db'; then
  echo 'Remote DB exists; keeping it.'
else
  ssh opc@146.56.170.98 'mkdir -p /home/opc/opict/server/data'
  scp -r server/data/. opc@146.56.170.98:/home/opc/opict/server/data/
fi
```

그 다음 서버에서 최초 배포를 실행한다.

```bash
ssh opc@146.56.170.98 'DEPLOY_PATH=/home/opc/opict bash /home/opc/opict/scripts/deploy-remote.sh'
```

스크립트는 `.env`, Whisper 바이너리·모델, `claude`·`codex`·`agy`를 확인하고,
서버 아키텍처에 맞게 `npm ci`와 웹 빌드를 수행한다. OCI Oracle Linux
aarch64에서 사전 빌드된 `better-sqlite3`가 호스트 glibc와 맞지 않으면 자동으로
소스 빌드해 설치한 뒤 user systemd unit을 재시작한다. 실패하면 서비스 상태와
최근 journal을 출력한다.

## Nginx와 HTTPS

최초 인증서 발급 전에는 임시 HTTP-only server block을 설치해
`opict.mygreed.shop`의 80번 포트를 Nginx가 받도록 한다. DNS가
`146.56.170.98`을 가리키고 HTTP 응답을 확인한 뒤 인증서를 발급한다.

```bash
sudo install -m 0644 /home/opc/opict/deploy/nginx/opict.mygreed.shop.http.conf \
  /etc/nginx/conf.d/opict.mygreed.shop.conf
sudo nginx -t
sudo systemctl reload nginx
curl -fsS http://opict.mygreed.shop/api/health
```

```bash
sudo certbot certonly --nginx -d opict.mygreed.shop
```

인증서 발급 후 최종 프록시 설정을 설치하고 검증·reload한다.

```bash
sudo install -m 0644 /home/opc/opict/deploy/nginx/opict.mygreed.shop.conf \
  /etc/nginx/conf.d/opict.mygreed.shop.conf
sudo nginx -t
sudo systemctl reload nginx
```

업로드는 50MB까지 허용하고, STT·AI 요청을 위해 프록시 read timeout은 300초다.

## GitHub Actions Secrets

저장소에 다음 Secrets를 등록한다.

```text
SSH_HOST=146.56.170.98
SSH_USER=opc
SSH_PORT=22
DEPLOY_PATH=/home/opc/opict
SSH_PRIVATE_KEY=<opc 접속 키 전체 내용>
```

이후 `master` push마다 서버는 소스만 rsync로 받고, 보존 대상인 `.env`, `server/data`,
`node_modules`, `web/dist`는 유지한다. 테스트 job이 서버 테스트와 웹 테스트·빌드에
성공한 경우에만 deploy job이 실행된다.

## 운영 확인

```bash
systemctl --user is-active opict
curl -fsS http://127.0.0.1:3001/api/health
sudo nginx -t
curl -fsS https://opict.mygreed.shop/api/health
```

최초 HTTPS 확인 후 브라우저에서 정적 화면, 설정, 연습 화면과 초기 카테고리·문항을
확인한다. 실제 휴대폰에서는 마이크 권한을 허용해 녹음→Whisper 전사→기본 Codex
평가→결과 표시→히스토리 재조회를 확인한다. 현재 AI 큐는 메모리 기반이므로 배포
중 진행 중인 AI 작업은 보존되지 않는다. 두 번째 배포 뒤 DB와 업로드 파일이
그대로 남는지도 확인한다.
