import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen, within, act, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'

/**
 * 這層測的是「使用者真的點下去會怎樣」，domain 那層已經測過純函式。
 * 沒有 Firebase 設定時 app 走 localStorage，所以每個 case 前清乾淨。
 */
beforeEach(() => {
  localStorage.clear()
})

/** 選好使用者並等 useWorkout 的非同步載入跑完 */
async function renderApp(user = 'bob') {
  // 沒選過使用者會先看到選人畫面，測試一律用 bob
  localStorage.setItem('workout:user', user)
  render(<App />)
  await screen.findByText('每週健身')
  // 載入中 → 有資料
  await screen.findByText('本週完成度')
}

/** 取某一天的卡片（週一 = index 0） */
function dayCard(label: string): HTMLElement {
  const heading = screen.getByText(`週${label}`)
  const card = heading.closest('article')
  if (!card) throw new Error(`找不到週${label}的卡片`)
  return card
}

describe('App — 打勾', () => {
  it('點部位會打勾，再點一次取消', async () => {
    const user = userEvent.setup()
    await renderApp()

    const mon = dayCard('一')
    // 週一早上第一個是「二三頭」
    const arms = within(mon).getAllByTitle('點擊打勾')[0]
    expect(arms.closest('.pill')).not.toHaveClass('is-done')

    await user.click(arms)
    expect(within(mon).getAllByTitle('點擊打勾')[0].closest('.pill')).toHaveClass('is-done')

    await user.click(within(mon).getAllByTitle('點擊打勾')[0])
    expect(within(mon).getAllByTitle('點擊打勾')[0].closest('.pill')).not.toHaveClass(
      'is-done',
    )
  })

  it('整段完成鈕會把該時段所有部位一次打勾', async () => {
    const user = userEvent.setup()
    await renderApp()

    const mon = dayCard('一')
    // 週一早上 = 二三頭 / 胸 / 肩 三項
    expect(within(mon).getAllByTitle('點擊打勾')).toHaveLength(3)

    await user.click(within(mon).getByTitle('整段標記完成'))

    const pills = within(mon)
      .getAllByTitle('點擊打勾')
      .map((b) => b.closest('.pill'))
    for (const pill of pills) {
      expect(pill).toHaveClass('is-done')
    }
    // 日計數應該是 3/3
    expect(within(mon).getByText('3/3')).toBeTruthy()
  })

  it('整段完成後再點一次，會把該時段全部取消', async () => {
    const user = userEvent.setup()
    await renderApp()

    const mon = dayCard('一')
    await user.click(within(mon).getByTitle('整段標記完成'))
    await user.click(within(mon).getByTitle('取消整段完成'))

    const pills = within(mon)
      .getAllByTitle('點擊打勾')
      .map((b) => b.closest('.pill'))
    for (const pill of pills) {
      expect(pill).not.toHaveClass('is-done')
    }
    expect(within(mon).getByText('0/3')).toBeTruthy()
  })
})

describe('App — 替換與補做池', () => {
  it('把沒打勾的項目換掉，會進補做池', async () => {
    const user = userEvent.setup()
    await renderApp()

    const mon = dayCard('一')
    await user.click(within(mon).getByLabelText('更換或移除二三頭'))

    // 選單開啟
    await screen.findByText('更換「二三頭」')
    const sheet = document.querySelector('.sheet') as HTMLElement
    await user.click(within(sheet).getByText('壁球').closest('button') as HTMLElement)

    // 週一早上現在有壁球、沒有二三頭
    expect(within(dayCard('一')).getByText('壁球')).toBeTruthy()
    expect(within(dayCard('一')).queryByText('二三頭')).toBeNull()

    // 補做池出現二三頭
    const makeup = document.querySelector('.makeup') as HTMLElement
    expect(makeup).toBeTruthy()
    expect(within(makeup).getByText('二三頭')).toBeTruthy()
  })

  it('已打勾的項目換掉，不會進補做池', async () => {
    const user = userEvent.setup()
    await renderApp()

    const mon = dayCard('一')
    await user.click(within(mon).getAllByTitle('點擊打勾')[0]) // 打勾二三頭
    await user.click(within(dayCard('一')).getByLabelText('更換或移除二三頭'))

    await screen.findByText('更換「二三頭」')
    const sheet = document.querySelector('.sheet') as HTMLElement
    await user.click(within(sheet).getByText('壁球').closest('button') as HTMLElement)

    expect(document.querySelector('.makeup')).toBeNull()
  })

  it('可以從一格移除項目', async () => {
    const user = userEvent.setup()
    await renderApp()

    await user.click(within(dayCard('一')).getByLabelText('更換或移除胸'))
    await screen.findByText('更換「胸」')
    await user.click(screen.getByText('從這一格移除'))

    expect(within(dayCard('一')).queryByText('胸')).toBeNull()
  })

  it('可以新增項目到空的晚上時段', async () => {
    const user = userEvent.setup()
    await renderApp()

    const mon = dayCard('一')
    await user.click(within(mon).getByLabelText('在週一晚上新增項目'))
    await screen.findByText('新增到 週一晚上')

    const sheet = document.querySelector('.sheet') as HTMLElement
    await user.click(within(sheet).getByText('腳踏車').closest('button') as HTMLElement)

    expect(within(dayCard('一')).getByText('腳踏車')).toBeTruthy()
  })
})

describe('App — 週切換與模板', () => {
  it('切到上一週會顯示回本週鈕，點了回到本週', async () => {
    const user = userEvent.setup()
    await renderApp()

    expect(screen.getByText('本週')).toBeTruthy()
    await user.click(screen.getByLabelText('上一週'))

    const back = await screen.findByText('回本週')
    await user.click(back)
    expect(screen.getByText('本週')).toBeTruthy()
  })

  it('上一週的打勾不會影響本週', async () => {
    const user = userEvent.setup()
    await renderApp()

    await user.click(within(dayCard('一')).getAllByTitle('點擊打勾')[0])
    expect(within(dayCard('一')).getByText('1/3')).toBeTruthy()

    await user.click(screen.getByLabelText('上一週'))
    await act(async () => {
      await Promise.resolve()
    })
    expect(within(dayCard('一')).getByText('0/3')).toBeTruthy()
  })

  it('切走再切回來，本週的勾原封不動', async () => {
    const user = userEvent.setup()
    await renderApp()

    await user.click(within(dayCard('一')).getByTitle('整段標記完成'))
    const before = screen.getByText(/格$/).textContent

    await user.click(screen.getByLabelText('上一週'))
    await act(async () => {
      await Promise.resolve()
    })
    await user.click(await screen.findByText('回本週'))
    await act(async () => {
      await Promise.resolve()
    })

    expect(screen.getByText(/格$/).textContent).toBe(before)
    expect(within(dayCard('一')).getByText('3/3')).toBeTruthy()
  })

  it('模板模式改動會套到之後的每一週', async () => {
    const user = userEvent.setup()
    await renderApp()

    await user.click(screen.getByLabelText('編輯模板'))
    await screen.findByText('模板模式：改動會套用到往後每一週')

    // 模板模式下點部位 = 開替換選單，不是打勾
    await user.click(within(dayCard('二')).getByLabelText('更換或移除間歇'))
    await screen.findByText('更換「間歇」')
    const sheet = document.querySelector('.sheet') as HTMLElement
    await user.click(within(sheet).getByText('腿').closest('button') as HTMLElement)

    await user.click(screen.getByText('完成'))

    // 下一週（尚未建立）應該用新模板生成
    await user.click(screen.getByLabelText('下一週'))
    await act(async () => {
      await Promise.resolve()
    })
    expect(within(dayCard('二')).getByText('腿')).toBeTruthy()
  })

  it('雲端沒真的連上時，頁尾不能謊稱已同步', async () => {
    await renderApp()

    // 測試環境沒有 Firebase 設定 → 一定是本機模式。
    // 這條擋的是「設定填了就說已同步」那種只看 handshake 的寫法。
    expect(screen.getByText('資料存在這台裝置')).toBeTruthy()
    expect(screen.queryByText('資料已同步雲端')).toBeNull()
  })
})

describe('App — 選使用者', () => {
  it('沒選過使用者時顯示選人畫面，三個帳號都在', async () => {
    render(<App />)
    await screen.findByText('選一個帳號，之後開啟就不用再選')

    for (const name of ['bob', 'user1', 'user2']) {
      expect(screen.getByRole('button', { name })).toBeTruthy()
    }
    // 還沒選人不該看到課表
    expect(screen.queryByText('本週完成度')).toBeNull()
  })

  it('選過之後會記住，重開不用再選', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'bob' }))
    await screen.findByText('本週完成度')
    expect(localStorage.getItem('workout:user')).toBe('bob')

    // 重新掛載 = 關掉重開
    cleanup()
    render(<App />)
    await screen.findByText('本週完成度')
    expect(screen.queryByText('選一個帳號，之後開啟就不用再選')).toBeNull()
  })

  it('登出會回到選人畫面，並忘掉記住的帳號', async () => {
    const user = userEvent.setup()
    await renderApp()

    await user.click(screen.getByRole('button', { name: '登出' }))
    await screen.findByText('選一個帳號，之後開啟就不用再選')
    expect(localStorage.getItem('workout:user')).toBeNull()
  })

  it('不同使用者的資料互不干擾', async () => {
    const user = userEvent.setup()
    await renderApp('user1')

    // user1 在週一早上打第一個勾
    await user.click(within(dayCard('一')).getAllByTitle('點擊打勾')[0])
    expect(
      within(dayCard('一')).getAllByTitle('點擊打勾')[0].closest('.pill'),
    ).toHaveClass('is-done')

    // 換成 user2 → 同一格應該是乾淨的
    await user.click(screen.getByRole('button', { name: '登出' }))
    await user.click(await screen.findByRole('button', { name: 'user2' }))
    await screen.findByText('本週完成度')
    expect(
      within(dayCard('一')).getAllByTitle('點擊打勾')[0].closest('.pill'),
    ).not.toHaveClass('is-done')

    // 切回 user1 → 勾還在
    await user.click(screen.getByRole('button', { name: '登出' }))
    await user.click(await screen.findByRole('button', { name: 'user1' }))
    await screen.findByText('本週完成度')
    expect(
      within(dayCard('一')).getAllByTitle('點擊打勾')[0].closest('.pill'),
    ).toHaveClass('is-done')
  })
})
