"""add quiz papers and ai grade to assignment progress

教师端三大增强：
  - quiz_papers：教师一键组卷生成的随堂测验卷（存抽题结果，供学生作答/二维码下发）
  - assignment_progress.ai_score / ai_comment：规则引擎预判分（教师可采纳/修改）

Revision ID: d4e5f6a7b8c9
Revises: c0a1b2c3d4e5
Create Date: 2026-11-03

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd4e5f6a7b8c9'
down_revision: Union[str, Sequence[str], None] = 'c0a1b2c3d4e5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # 一键组卷：随堂测验卷
    op.create_table(
        'quiz_papers',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('title', sa.String(200), nullable=False),
        sa.Column('scene_code', sa.String(64), nullable=False, default=''),
        sa.Column('question_ids', sa.Text(), nullable=False, default='[]'),  # JSON 数组：抽中的题目 id
        sa.Column('created_by', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
    )

    # AI 预判分：教师批改前的规则引擎草稿分
    op.add_column('assignment_progress', sa.Column('ai_score', sa.Float(), nullable=True))
    op.add_column('assignment_progress', sa.Column('ai_comment', sa.Text(), nullable=False, server_default=''))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('assignment_progress', 'ai_comment')
    op.drop_column('assignment_progress', 'ai_score')
    op.drop_table('quiz_papers')
