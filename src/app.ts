import { App } from '@slack/bolt'
import {
  OpenAIApi,
  Configuration,
  ChatCompletionRequestMessageRoleEnum,
} from 'openai'

require('dotenv').config()

import express from 'express';

// 以下のコードを追加
const expressApp = express();
expressApp.get('/', (req, res) => {
  res.send('hi!');
});
expressApp.listen(3080, () => {
  console.log('Server is running on port 3080');
});


const systemContent =
  process.env.SYSTEM_MESSAGE ??
  `
  You are a Slack bot.
  You start a conversation triggered by a Mention addressed to you.
  Each conversation message contains an Author ID.
  The Author ID is in the form "<@Author ID> message text
`

const waitMessage = process.env.WAIT_MESSAGE ?? 'Please wait a second...'

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
})

const openai = new OpenAIApi(configuration)

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
})

type Message = {
  role: ChatCompletionRequestMessageRoleEnum
  content: string
}

type SlackMessage ={
  text:  string | undefined
  bot_id: string
}

type SlackSendError = 
{data:{ok:boolean, error:string}}

async function chat(messages: Message[]) {
  try {
    const completion = await openai.createChatCompletion({
      model: 'gpt-3.5-turbo',
      messages,
    })
    console.log(messages)
    console.log(completion.data.usage?.prompt_tokens)
    return completion.data.choices[0].message!.content
  } catch (e: any) {
    try {
      const code = e.response.data.error.code
      console.log(e)
      const message = e.response.data.error.message

      if (
        code === 'context_length_exceeded' &&
        process.env.CONTEXT_LENGTH_EXCEEDED_MESSAGE
      ) {
        return process.env.CONTEXT_LENGTH_EXCEEDED_MESSAGE
      }

      if (message) {
        return message
      } else {
        return 'unknown error'
      }
    } catch (e: any) {
      return 'unknown error'
    }
  }
}

;(async () => {
  await app.start()
})()

app.event('app_mention', async ({ event, context, client, say }) => {
  const messages: Message[] = [
    {
      role: 'system',
      content: systemContent,
    },
    {
      role: 'user',
      content: event.text,
    },
  ]

  const reply = await say({
    text: waitMessage,
    thread_ts: event.ts,
  })

  const text = await chat(messages)

  await client.chat.update({
    channel: event.channel,
    ts: reply.ts!,
    text,
  })
})

app.event('message', async ({ event, context, client, say }) => {
  // @ts-ignore // event.thread_ts is not defined
  const thread_ts = (event.thread_ts as string) || undefined

  if (!thread_ts) return

  const replies = await client.conversations.replies({
    channel: event.channel,
    ts: thread_ts
  })

  if(!isBotMentionedInReplies(replies.messages)) return
  
  if (!replies.messages || replies.messages?.length === 0) return

  if (replies.messages[replies.messages.length - 1].bot_id === context.botId)
    return

  const threadMessages: Message[] = replies.messages.map((message) => {
    
    if (message.bot_id === context.botId) {
      return {
        role: 'assistant',
        content: message.text!,
      }
    } else {
      return {
        role: 'user',
        content: message.text!,
      }
    }
  })

  const messages: Message[] = [
    {
      role: 'system',
      content: systemContent,
    },
    ...threadMessages,
  ]

  const reply = await say({
    text: waitMessage,
    thread_ts: event.ts,
  })

  const text = await chat(messages)
  const splitedText:string[] = splitText(text)
  console.log(text)


  // TODO:チャット文章を分割するロジックを追加
  try {
    await client.chat.update({
      channel: event.channel,
      ts: reply.ts!,
      text,
    })
  }catch (e:any ) {
    const error:string = e.data.error
    await client.chat.update({
      channel: event.channel,
      ts: reply.ts!,
      error,
    })
  }

  
})



function splitText(text: string): string[] {
  const maxLength = 3000;
  const regex = new RegExp(`.{1,${maxLength}}`, 'g');
  const chunks = text.match(regex);
  return chunks ? chunks : [];
}


  // Bot自身がメンションされているかどうかを判定する関数
  function isBotMentionedInReplies(_messages:Array<any> |undefined) {
    const messages:Array<SlackMessage> |undefined = _messages
    return messages?.some(obj => obj.text?.includes(`<@${process.env.BOT_ID}>`))
  }