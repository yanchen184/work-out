import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within, act, cleanup, fireEvent } from '@testing-library/react'
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
  localStorage.setItem('workout:user', user)
  render(<App />)
  await screen.findByText('每週健身')
  // 載入中 → 有資料（格線出現代表課表已經載進來）
  await screen.findByText('早上')
}

/** 取某一天某一格（週一 = 0） */
function cell(day: number, slot: 'morning' | 'evening'): HTMLElement {
  const el = document.querySelector(`[data-day="${day}"][data-slot="${slot}"]`)
  if (!el) throw new Error(`找不到 day=${day} slot=${slot} 的格子`)
  return el as HTMLElement
}

/** 取某一顆方塊 */
function tile(day: number, slot: 'morning' | 'evening', name: string): HTMLElement {
  return within(cell(day, slot)).getByText(name).closest('.tile') as HTMLElement
}

/**
 * 模擬手指把某顆方塊拖到某一格。
 * useDrag 是按住 180ms 才算拿起，所以要真的等過那個門檻。
 */
async function dragTo(
  from: { day: number; slot: 'morning' | 'evening'; name: string },
  to: { day: number; slot: 'morning' | 'evening'; onto?: string },
) {
  const source = tile(from.day, from.slot, from.name)
  const target = cell(to.day, to.slot)

  // jsdom 沒有版面，elementFromPoint 永遠回 null。
  // 手指真的放下去時碰到的是「落點格」或「格內某顆方塊」，這裡照樣模擬。
  const original = document.elementFromPoint
  document.elementFromPoint = () =>
    to.onto ? tile(to.day, to.slot, to.onto) : target

  fireEvent.pointerDown(source, { clientX: 10, clientY: 10 })
  await act(async () => {
    await new Promise((r) => setTimeout(r, 220))
  })
  fireEvent.pointerMove(window, { clientX: 200, clientY: 300 })
  await act(async () => {
    fireEvent.pointerUp(window, { clientX: 200, clientY: 300 })
  })

  document.elementFromPoint = original
}

describe('App — 打勾', () => {
  it('點方塊會打勾，再點一次取消', async () => {
    const user = userEvent.setup()
    await renderApp()

    // 週一早上預設有 二三頭 / 胸 / 肩
    expect(tile(0, 'morning', '二三頭')).not.toHaveClass('is-done')

    await user.click(tile(0, 'morning', '二三頭'))
    expect(tile(0, 'morning', '二三頭')).toHaveClass('is-done')

    await user.click(tile(0, 'morning', '二三頭'))
    expect(tile(0, 'morning', '二三頭')).not.toHaveClass('is-done')
  })

  it('打勾會反映到總進度百分比', async () => {
    const user = userEvent.setup()
    await renderApp()

    expect(screen.getByText('0%')).toBeTruthy()
    await user.click(tile(0, 'morning', '二三頭'))
    expect(screen.queryByText('0%')).toBeNull()
  })
})

describe('App — 拖放', () => {
  it('拖到空格＝單純搬過去，原本那格就沒了', async () => {
    await renderApp()

    // 週日整天沒排東西
    expect(within(cell(6, 'morning')).queryByText('二三頭')).toBeNull()

    await dragTo({ day: 0, slot: 'morning', name: '二三頭' }, { day: 6, slot: 'morning' })

    expect(within(cell(6, 'morning')).getByText('二三頭')).toBeTruthy()
    expect(within(cell(0, 'morning')).queryByText('二三頭')).toBeNull()
    // 單純搬移不算欠，不進補做
    expect(document.querySelector('.makeup')).toBeNull()
  })

  it('打過勾的方塊被搬走，勾要跟著走', async () => {
    const user = userEvent.setup()
    await renderApp()

    await user.click(tile(0, 'morning', '二三頭'))
    expect(tile(0, 'morning', '二三頭')).toHaveClass('is-done')

    await dragTo({ day: 0, slot: 'morning', name: '二三頭' }, { day: 6, slot: 'morning' })

    expect(tile(6, 'morning', '二三頭')).toHaveClass('is-done')
  })

  it('同一個部位出現在多天時，凹槽只留在被拿走的那一格', async () => {
    await renderApp()

    // 二三頭 同時在週一早上與週四早上。拿起週一那顆，週四那顆不該跟著變凹槽。
    const source = tile(0, 'morning', '二三頭')
    const original = document.elementFromPoint
    document.elementFromPoint = () => cell(0, 'evening')

    fireEvent.pointerDown(source, { clientX: 10, clientY: 10 })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 220))
    })

    expect(tile(0, 'morning', '二三頭')).toHaveClass('is-ghost')
    expect(tile(3, 'morning', '二三頭')).not.toHaveClass('is-ghost')

    await act(async () => {
      fireEvent.pointerUp(window, { clientX: 200, clientY: 300 })
    })
    document.elementFromPoint = original
  })

  it('拖到有東西的格子＝交換，被頂出來的黏在手上', async () => {
    await renderApp()

    // 週二早上有 間歇，放到「間歇」上面 → 頂掉間歇
    await dragTo(
      { day: 0, slot: 'morning', name: '二三頭' },
      { day: 1, slot: 'morning', onto: '間歇' },
    )

    // 二三頭 進到週二早上
    expect(within(cell(1, 'morning')).getByText('二三頭')).toBeTruthy()
    // 被頂出來的那顆仍浮在手上，垃圾桶也會保持可用，還沒落地就不進補做池
    expect(document.querySelector('.tile.is-floating')).toBeTruthy()
    expect(screen.getByLabelText('拖到這裡丟棄')).toBeTruthy()
    expect(document.querySelector('.makeup')).toBeNull()
  })
})

describe('App — 格線外與垃圾桶都移到補做', () => {
  it('按下時 capture 同一支手指，滑出原方塊後仍收得到放手', async () => {
    await renderApp()

    const source = tile(0, 'morning', '二三頭')
    const capture = vi.fn()
    source.setPointerCapture = capture

    fireEvent.pointerDown(source, { pointerId: 7, clientX: 10, clientY: 10 })

    expect(capture).toHaveBeenCalledWith(7)
  })

  it('往底部中央滑時顯示垃圾桶吸附，放手後原格消失並進補做', async () => {
    await renderApp()

    const source = tile(0, 'morning', '二三頭')
    const original = document.elementFromPoint
    document.elementFromPoint = () => document.querySelector('.trash-drop')

    fireEvent.pointerDown(source, { pointerId: 7, clientX: 10, clientY: 10 })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 220))
    })
    fireEvent.pointerMove(window, {
      pointerId: 7,
      clientX: window.innerWidth / 2,
      clientY: window.innerHeight - 30,
    })

    expect(screen.getByLabelText('拖到這裡丟棄')).toHaveClass('is-active')
    expect(document.querySelector('.tile.is-floating')).toHaveClass('is-absorbed')
    expect(screen.getByText('放手丟棄')).toBeTruthy()

    await act(async () => {
      fireEvent.pointerUp(window, {
        pointerId: 7,
        clientX: window.innerWidth / 2,
        clientY: window.innerHeight - 30,
      })
    })
    document.elementFromPoint = original

    expect(within(cell(0, 'morning')).queryByText('二三頭')).toBeNull()
    expect(screen.queryByLabelText('拖到這裡丟棄')).toBeNull()
    const makeup = document.querySelector('.makeup') as HTMLElement
    expect(makeup).toBeTruthy()
    expect(within(makeup).getByText('二三頭')).toBeTruthy()
  })

  it('手上的方塊放到格線外 → 原格消失並進本週補做', async () => {
    await renderApp()

    const source = tile(0, 'morning', '二三頭')
    // elementFromPoint 回 null＝手指下面不是任何格子＝空白處
    const original = document.elementFromPoint
    document.elementFromPoint = () => null

    fireEvent.pointerDown(source, { clientX: 10, clientY: 10 })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 220))
    })
    await act(async () => {
      fireEvent.pointerUp(window, { clientX: 5, clientY: 700 })
    })
    document.elementFromPoint = original

    expect(within(cell(0, 'morning')).queryByText('二三頭')).toBeNull()
    const makeup = document.querySelector('.makeup') as HTMLElement
    expect(makeup).toBeTruthy()
    expect(within(makeup).getByText('二三頭')).toBeTruthy()
  })

  it('本週補做顯示同款方塊，且可以拖回任一空格', async () => {
    await renderApp()

    const original = document.elementFromPoint
    document.elementFromPoint = () => null
    fireEvent.pointerDown(tile(0, 'morning', '二三頭'), { clientX: 10, clientY: 10 })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 220))
    })
    await act(async () => {
      fireEvent.pointerUp(window, { clientX: 5, clientY: 700 })
    })

    const makeup = document.querySelector('.makeup') as HTMLElement
    const makeupTile = within(makeup).getByText('二三頭').closest('.tile') as HTMLElement
    expect(makeupTile).toBeTruthy()
    expect(makeupTile.closest('.mk-item')).toBeTruthy()

    document.elementFromPoint = () => cell(6, 'morning')
    fireEvent.pointerDown(makeupTile, { clientX: 20, clientY: 650 })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 220))
    })
    await act(async () => {
      fireEvent.pointerUp(window, { clientX: 200, clientY: 500 })
    })
    document.elementFromPoint = original

    expect(within(cell(6, 'morning')).getByText('二三頭')).toBeTruthy()
    expect(document.querySelector('.makeup')).toBeNull()
  })

  it('兩個二三頭補做只會移除實際拖回的那一顆', async () => {
    await renderApp()

    const original = document.elementFromPoint
    document.elementFromPoint = () => null

    for (const day of [0, 3]) {
      fireEvent.pointerDown(tile(day, 'morning', '二三頭'), {
        clientX: 10,
        clientY: 10,
      })
      await act(async () => {
        await new Promise((r) => setTimeout(r, 220))
      })
      await act(async () => {
        fireEvent.pointerUp(window, { clientX: 5, clientY: 700 })
      })
    }

    const makeup = document.querySelector('.makeup') as HTMLElement
    expect(within(makeup).getAllByText('二三頭')).toHaveLength(2)

    const firstMakeupTile = within(makeup).getAllByText('二三頭')[0].closest('.tile') as HTMLElement
    document.elementFromPoint = () => cell(6, 'morning')
    fireEvent.pointerDown(firstMakeupTile, { clientX: 20, clientY: 650 })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 220))
    })
    await act(async () => {
      fireEvent.pointerUp(window, { clientX: 200, clientY: 500 })
    })
    document.elementFromPoint = original

    expect(within(cell(6, 'morning')).getByText('二三頭')).toBeTruthy()
    expect(within(document.querySelector('.makeup') as HTMLElement).getAllByText('二三頭')).toHaveLength(1)
  })

  it('已打勾的放到格線外會從原格消失，但不進補做', async () => {
    const user = userEvent.setup()
    await renderApp()

    await user.click(tile(0, 'morning', '二三頭'))

    const source = tile(0, 'morning', '二三頭')
    const original = document.elementFromPoint
    document.elementFromPoint = () => null

    fireEvent.pointerDown(source, { clientX: 10, clientY: 10 })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 220))
    })
    await act(async () => {
      fireEvent.pointerUp(window, { clientX: 5, clientY: 700 })
    })
    document.elementFromPoint = original

    expect(within(cell(0, 'morning')).queryByText('二三頭')).toBeNull()
    expect(document.querySelector('.makeup')).toBeNull()
  })
})

describe('App — 新增項目', () => {
  it('可以新增項目到空的時段', async () => {
    const user = userEvent.setup()
    await renderApp()

    await user.click(within(cell(6, 'evening')).getByLabelText('加入訓練'))
    await screen.findByText('加入訓練')

    const sheet = document.querySelector('.sheet') as HTMLElement
    await user.click(within(sheet).getByText('腳踏車'))

    expect(within(cell(6, 'evening')).getByText('腳踏車')).toBeTruthy()
  })
})

describe('App — 底部拉盤', () => {
  it('部位進度拉盤打得開，主畫面還在', async () => {
    const user = userEvent.setup()
    await renderApp()

    await user.click(screen.getByText('部位進度'))
    const sheet = await screen.findByRole('dialog', { name: '部位進度' })
    expect(sheet).toBeTruthy()
    // 拉盤上來時主畫面沒有被換掉
    expect(screen.getByText('每週健身')).toBeTruthy()

    await user.click(screen.getByLabelText('關閉'))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('每週模板拉盤可以把這週存成模板，之後的週沿用', async () => {
    const user = userEvent.setup()
    await renderApp()

    // 先把週一早上的二三頭搬到週日，讓這週跟預設模板不一樣
    await dragTo({ day: 0, slot: 'morning', name: '二三頭' }, { day: 6, slot: 'morning' })

    await user.click(screen.getByText('每週模板'))
    await user.click(await screen.findByText('把這週存成模板'))

    // 下一週（尚未建立）應該用新模板生成
    await user.click(screen.getByLabelText('下一週'))
    await act(async () => {
      await Promise.resolve()
    })
    expect(within(cell(6, 'morning')).getByText('二三頭')).toBeTruthy()
  })
})

describe('App — 週切換', () => {
  it('切到上一週再切回本週', async () => {
    const user = userEvent.setup()
    await renderApp()

    expect(screen.getByText('本週')).toBeTruthy()
    await user.click(screen.getByLabelText('上一週'))
    await act(async () => {
      await Promise.resolve()
    })
    expect(screen.queryByText('本週')).toBeNull()

    await user.click(screen.getByLabelText('下一週'))
    await act(async () => {
      await Promise.resolve()
    })
    expect(screen.getByText('本週')).toBeTruthy()
  })

  it('上一週的打勾不會影響本週', async () => {
    const user = userEvent.setup()
    await renderApp()

    await user.click(tile(0, 'morning', '二三頭'))
    expect(tile(0, 'morning', '二三頭')).toHaveClass('is-done')

    await user.click(screen.getByLabelText('上一週'))
    await act(async () => {
      await Promise.resolve()
    })
    expect(tile(0, 'morning', '二三頭')).not.toHaveClass('is-done')
  })

  it('切走再切回來，本週的勾原封不動', async () => {
    const user = userEvent.setup()
    await renderApp()

    await user.click(tile(0, 'morning', '二三頭'))

    await user.click(screen.getByLabelText('上一週'))
    await act(async () => {
      await Promise.resolve()
    })
    await user.click(screen.getByLabelText('下一週'))
    await act(async () => {
      await Promise.resolve()
    })

    expect(tile(0, 'morning', '二三頭')).toHaveClass('is-done')
  })
})

describe('App — 同步狀態', () => {
  it('雲端沒真的連上時，不能謊稱已同步', async () => {
    await renderApp()

    // 測試環境沒有 Firebase 設定 → 一定是本機模式。
    // 這條擋的是「設定填了就說已同步」那種只看 handshake 的寫法。
    expect(screen.getByText('存在這台裝置')).toBeTruthy()
    expect(screen.queryByText('已同步雲端')).toBeNull()
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
    expect(screen.queryByText('早上')).toBeNull()
  })

  it('選過之後會記住，重開不用再選', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'bob' }))
    await screen.findByText('早上')
    expect(localStorage.getItem('workout:user')).toBe('bob')

    // 重新掛載 = 關掉重開
    cleanup()
    render(<App />)
    await screen.findByText('早上')
    expect(screen.queryByText('選一個帳號，之後開啟就不用再選')).toBeNull()
  })

  it('換人會回到選人畫面，並忘掉記住的帳號', async () => {
    const user = userEvent.setup()
    await renderApp()

    await user.click(screen.getByTitle('換人'))
    await screen.findByText('選一個帳號，之後開啟就不用再選')
    expect(localStorage.getItem('workout:user')).toBeNull()
  })

  it('不同使用者的資料互不干擾', async () => {
    const user = userEvent.setup()
    await renderApp('user1')

    await user.click(tile(0, 'morning', '二三頭'))
    expect(tile(0, 'morning', '二三頭')).toHaveClass('is-done')

    // 換成 user2 → 同一格應該是乾淨的
    await user.click(screen.getByTitle('換人'))
    await user.click(await screen.findByRole('button', { name: 'user2' }))
    await screen.findByText('早上')
    expect(tile(0, 'morning', '二三頭')).not.toHaveClass('is-done')

    // 切回 user1 → 勾還在
    await user.click(screen.getByTitle('換人'))
    await user.click(await screen.findByRole('button', { name: 'user1' }))
    await screen.findByText('早上')
    expect(tile(0, 'morning', '二三頭')).toHaveClass('is-done')
  })
})

/**
 * 鍵盤與 dialog 無障礙。
 *
 * 這些不是「順手加的 aria」，是實測抓到的真缺口：方塊有 role="button" 也 tab 得到，
 * 但 div 不會自己把 Enter/Space 轉成 click——鍵盤使用者根本打不了勾（app 的主要互動）。
 * 拉盤同樣沒有 Esc、沒有 focus trap，tab 會跑到蓋在底下看不見的元素上。
 */
describe('App — 鍵盤操作', () => {
  it('方塊 tab 得到，按 Enter 就打勾', async () => {
    const user = userEvent.setup()
    await renderApp()

    const t = tile(0, 'morning', '二三頭')
    t.focus()
    expect(document.activeElement).toBe(t)

    await user.keyboard('{Enter}')
    expect(tile(0, 'morning', '二三頭')).toHaveClass('is-done')
  })

  it('按空白鍵也能打勾，而且不會捲動頁面', async () => {
    const user = userEvent.setup()
    await renderApp()

    const t = tile(0, 'evening', '胸')
    t.focus()
    await user.keyboard(' ')
    expect(tile(0, 'evening', '胸')).toHaveClass('is-done')
  })

  it('Enter 打完可以再按一次取消（跟滑鼠一致）', async () => {
    const user = userEvent.setup()
    await renderApp()

    tile(0, 'morning', '二三頭').focus()
    await user.keyboard('{Enter}')
    expect(tile(0, 'morning', '二三頭')).toHaveClass('is-done')

    tile(0, 'morning', '二三頭').focus()
    await user.keyboard('{Enter}')
    expect(tile(0, 'morning', '二三頭')).not.toHaveClass('is-done')
  })

  it('方塊有看得懂的 aria-label，打勾後會講出狀態', async () => {
    const user = userEvent.setup()
    await renderApp()

    // 二三頭 週一與週四早上都有，所以要限定在某一格裡找
    const mon = within(cell(0, 'morning'))
    expect(mon.getByRole('button', { name: '二三頭' })).toBeTruthy()

    await user.click(tile(0, 'morning', '二三頭'))
    expect(mon.getByRole('button', { name: '二三頭（已完成）' })).toBeTruthy()
    // 週四那顆不受影響，label 也不該跟著變
    expect(within(cell(3, 'morning')).getByRole('button', { name: '二三頭' })).toBeTruthy()
  })
})

describe('App — dialog 無障礙', () => {
  it('按 Esc 可以關掉拉盤', async () => {
    const user = userEvent.setup()
    await renderApp()

    await user.click(screen.getByText('部位進度'))
    await screen.findByRole('dialog', { name: '部位進度' })

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('拉盤標成 aria-modal，讀屏才知道底下的東西被蓋住了', async () => {
    const user = userEvent.setup()
    await renderApp()

    await user.click(screen.getByText('部位進度'))
    const sheet = await screen.findByRole('dialog', { name: '部位進度' })
    expect(sheet.getAttribute('aria-modal')).toBe('true')
  })

  it('打開拉盤時焦點會移進去，不會留在底下的畫面', async () => {
    const user = userEvent.setup()
    await renderApp()

    await user.click(screen.getByText('每週模板'))
    const sheet = await screen.findByRole('dialog', { name: '每週模板' })
    expect(sheet.contains(document.activeElement)).toBe(true)
  })

  it('關掉拉盤後焦點回到原本那顆按鈕', async () => {
    const user = userEvent.setup()
    await renderApp()

    const opener = screen.getByText('部位進度')
    opener.focus()
    await user.click(opener)
    await screen.findByRole('dialog', { name: '部位進度' })

    await user.keyboard('{Escape}')
    expect(document.activeElement).toBe(opener)
  })

  it('Tab 在拉盤裡繞，不會跑到底下看不見的元素', async () => {
    const user = userEvent.setup()
    await renderApp()

    await user.click(screen.getByText('每週模板'))
    const sheet = await screen.findByRole('dialog', { name: '每週模板' })

    // 連按幾次 Tab，焦點都該還在拉盤內
    for (let i = 0; i < 6; i += 1) {
      await user.tab()
      expect(sheet.contains(document.activeElement)).toBe(true)
    }
  })
})
