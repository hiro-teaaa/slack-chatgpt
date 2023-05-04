# ベースとなるイメージを指定
FROM node:14

# 作業ディレクトリを指定
WORKDIR /app

# package.jsonとyarn.lockのコピー
COPY package*.json ./

# 依存関係のダウンロード
RUN yarn

# アプリケーションファイルのコピー
COPY . .

# ポートを指定
EXPOSE 3080

# 環境変数を設定（本番環境の場合）
ENV NODE_ENV=production

# ビルドタスク（本番環境の場合）
RUN yarn build

# コンテナを起動する際に実行されるコマンドを指定
CMD ["yarn", "start"]