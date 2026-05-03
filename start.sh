#!/usr/bin/env bash
# start.sh - virt-person 启动脚本

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONDA_ENV="virt-person"

# ── 初始化环境 ────────────────────────────────────────────────
CONDA_BASE=$(conda info --base 2>/dev/null || echo "$HOME/miniconda3")
source "$CONDA_BASE/etc/profile.d/conda.sh"
conda activate "$CONDA_ENV" 2>/dev/null

NVM_INIT="export NVM_DIR=\"\$HOME/.nvm\" && source \"\$NVM_DIR/nvm.sh\""
CONDA_INIT="source \"$CONDA_BASE/etc/profile.d/conda.sh\" && conda activate $CONDA_ENV"

# ── 工具函数 ──────────────────────────────────────────────────
is_running() {
    pgrep -f "$1" >/dev/null 2>&1
}

run_in_terminal() {
    local title="$1"
    local cmd="$2"
    if command -v gnome-terminal &>/dev/null; then
        gnome-terminal --title="$title" -- bash -c "$cmd; echo; echo '--- 进程已退出，按 Enter 关闭 ---'; read"
    elif command -v xterm &>/dev/null; then
        xterm -title "$title" -e bash -c "$cmd; echo; echo '--- 进程已退出，按 Enter 关闭 ---'; read" &
    else
        echo "  ✗ 未找到终端模拟器（gnome-terminal 或 xterm）"
        return 1
    fi
}

stop_process() {
    local pattern="$1"
    local name="$2"
    if is_running "$pattern"; then
        pkill -f "$pattern"
        echo "  已停止 $name"
    else
        echo "  $name 未在运行"
    fi
}

# ── 状态显示 ──────────────────────────────────────────────────
show_status() {
    echo ""
    echo "  服务状态："
    if is_running "interaction/main.py"; then
        echo "    [运行中] 语音交互管道   (interaction/main.py)"
    else
        echo "    [已停止] 语音交互管道"
    fi
    if is_running "electron.*dist/main"; then
        echo "    [运行中] 虚拟人物前端   (Electron)"
    else
        echo "    [已停止] 虚拟人物前端"
    fi
    echo ""
}

# ── 主菜单 ────────────────────────────────────────────────────
while true; do
    clear
    echo "========================================"
    echo "  virt-person 启动管理"
    echo "========================================"
    show_status
    echo "  操作："
    echo "    1) 启动全部"
    echo "    2) 启动语音交互管道"
    echo "    3) 启动虚拟人物前端"
    echo "    ──────────────────"
    echo "    4) 停止全部"
    echo "    5) 停止语音交互管道"
    echo "    6) 停止虚拟人物前端"
    echo "    ──────────────────"
    echo "    q) 退出"
    echo ""
    read -rp "  请选择 > " choice

    case "$choice" in
        1)
            echo ""
            if is_running "interaction/main.py"; then
                echo "  语音交互管道已在运行，跳过"
            else
                run_in_terminal "语音交互" "$CONDA_INIT && cd $REPO_DIR && python interaction/main.py"
                echo "  ✓ 语音交互管道已启动"
            fi
            if is_running "electron.*dist/main"; then
                echo "  虚拟人物前端已在运行，跳过"
            else
                run_in_terminal "虚拟人物" "$NVM_INIT && cd $REPO_DIR && nvm use && npm run build && npm run electron"
                echo "  ✓ 虚拟人物前端已启动"
            fi
            read -rp "  按 Enter 返回菜单..." _
            ;;
        2)
            echo ""
            if is_running "interaction/main.py"; then
                echo "  语音交互管道已在运行"
            else
                run_in_terminal "语音交互" "$CONDA_INIT && cd $REPO_DIR && python interaction/main.py"
                echo "  ✓ 语音交互管道已启动"
            fi
            read -rp "  按 Enter 返回菜单..." _
            ;;
        3)
            echo ""
            if is_running "electron.*dist/main"; then
                echo "  虚拟人物前端已在运行"
            else
                run_in_terminal "虚拟人物" "$NVM_INIT && cd $REPO_DIR && nvm use && npm run build && npm run electron"
                echo "  ✓ 虚拟人物前端已启动"
            fi
            read -rp "  按 Enter 返回菜单..." _
            ;;
        4)
            echo ""
            stop_process "electron.*dist/main" "虚拟人物前端"
            stop_process "interaction/main.py" "语音交互管道"
            read -rp "  按 Enter 返回菜单..." _
            ;;
        5)
            echo ""
            stop_process "interaction/main.py" "语音交互管道"
            read -rp "  按 Enter 返回菜单..." _
            ;;
        6)
            echo ""
            stop_process "electron.*dist/main" "虚拟人物前端"
            read -rp "  按 Enter 返回菜单..." _
            ;;
        q|Q)
            echo ""
            echo "  退出启动管理器（已启动的服务继续运行）"
            echo ""
            exit 0
            ;;
        *)
            ;;
    esac
done
