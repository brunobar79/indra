export const GET = 'GET'
export const POST = 'POST'

export class Networking {
  baseUrl: string

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl
  }

  get = (url: string) => {
    return this.request(url, GET)
  }

  post = (url: string, body: any) => {
    return this.request(url, POST, body)
  }

  request = async (url: string, method: any, body?: any) => {
    // TO DO: better type
    const opts = {
      method,
    } as any

    let res
    if (method === POST) {
      opts.body = JSON.stringify(body)
      opts.headers = {
        'Content-Type': 'application/json',
      }
    }
    opts.mode = 'cors'
    // opts.credentials = 'include' // Don't need this if we aren't using cookies for auth
    res = await fetch(`${this.baseUrl}/${url}`, opts)

    if (res.status < 200 || res.status > 299) {
      let text
      try {
        text = await res.text()
      } catch (e) {
        text = res.statusText
      }


      throw errorResponse(
        res.status,
        res.body,
        `Received non-200 response: ${text}`,
      )
    }

    if (res.status === 204) {
      return {
        data: null,
      }
    }

    const data = await res.json()

    return {
      data,
    }
  }
}

export const errorResponse = (status: number, body: any, message: string) => {
  return {
    status,
    body,
    message,
  }
}
